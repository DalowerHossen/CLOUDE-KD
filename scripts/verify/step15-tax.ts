// path: scripts/verify/step15-tax.ts
// Logic checks of the tax reporting rules and the audit pack (15.7.c) that need no database: jurisdiction of a tax code, sales tax by
// jurisdiction, the VAT or GST return, withholding by payee, the quarterly provision, paid against due, the reminder stages, and the
// audit pack manifest that detects a changed section. The database rules are in sql/assertions/s15_009_tax_audit.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-tax.ts
import assert from 'node:assert/strict';
import {
  checkPack,
  manifestOf,
  packInput,
  sectionOf,
  sha256Hex,
  type Manifest,
} from '@/services/accounting/audit-pack-rules';
import {
  deadlineInput,
  deadlineUpdate,
  filingSettingsInput,
  jurisdictionOf,
  paidVsDue,
  paymentInput,
  provision,
  quarterOf,
  reminderStage,
  salesTaxLines,
  vatReturn,
  withholdingByPayee,
  type InvoiceTax,
  type RateInfo,
} from '@/services/taxfiling/tax-rules';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const rates = new Map<string, RateInfo>([
  [
    'CA-ST',
    { code: 'CA-ST', name: 'California sales tax', kind: 'sales', country: 'US', region: 'ca' },
  ],
  ['TX-ST', { code: 'TX-ST', name: 'Texas sales tax', kind: 'sales', country: 'US', region: 'TX' }],
  ['UK-VAT', { code: 'UK-VAT', name: 'UK VAT', kind: 'vat', country: 'GB', region: '' }],
  ['WHT', { code: 'WHT', name: 'Withholding', kind: 'withholding', country: 'US', region: '' }],
  ['MYSTERY', { code: 'MYSTERY', name: 'Mystery', kind: 'sales', country: null, region: '' }],
]);
const inv = (
  id: string,
  client: string,
  rows: InvoiceTax['rows'],
  withholding = '0',
  total = '0',
): InvoiceTax => ({
  id,
  clientKey: client,
  clientName: client,
  issueDate: '2026-02-10',
  rows,
  withholdingRate: withholding === '0' ? '0' : '10',
  withholding,
  total,
});
const row = (
  code: string,
  rate: string,
  base: string,
  amount: string,
): InvoiceTax['rows'][number] => ({ code, name: code, rate, base, amount });

check('jurisdiction of a tax code', () => {
  assert.equal(jurisdictionOf(rates.get('CA-ST')), 'US-CA');
  assert.equal(jurisdictionOf(rates.get('UK-VAT')), 'GB');
  assert.equal(jurisdictionOf(rates.get('MYSTERY')), 'Unspecified');
  assert.equal(jurisdictionOf(undefined), 'Unspecified');
});

check('sales tax by jurisdiction: grouped, counted once per invoice, other kinds left out', () => {
  const invoices = [
    inv('1', 'A', [row('CA-ST', '7.5', '1000', '75'), row('TX-ST', '6.25', '100', '6.25')]),
    inv('2', 'B', [row('CA-ST', '7.5', '500', '37.5')]),
    inv('3', 'A', [row('UK-VAT', '20', '100', '20'), row('WHT', '10', '100', '10')]),
    inv('4', 'C', [row('NOPE', '5', '100', '5')]),
  ];
  const lines = salesTaxLines(invoices, rates, ['sales', 'vat', 'gst', 'other']);
  const ca = lines.find((l) => l.code === 'CA-ST');
  assert.equal(ca?.jurisdiction, 'US-CA');
  assert.equal(ca?.invoices, 2);
  assert.equal(ca?.base, '1500.0000');
  assert.equal(ca?.tax, '112.5000');
  assert.ok(!lines.some((l) => l.code === 'WHT'));
  assert.equal(lines.find((l) => l.code === 'NOPE')?.jurisdiction, 'Unspecified');
  assert.deepEqual(
    lines.map((l) => l.jurisdiction),
    ['GB', 'Unspecified', 'US-CA', 'US-TX'],
  );
  const rateChange = salesTaxLines(
    [
      inv('5', 'A', [row('CA-ST', '7.25', '100', '7.25')]),
      inv('6', 'A', [row('CA-ST', '7.5', '100', '7.5')]),
    ],
    rates,
  );
  assert.equal(rateChange.filter((l) => l.code === 'CA-ST').length, 2);
});

check('VAT return: output less input, a refund is negative', () => {
  const output = salesTaxLines([inv('1', 'A', [row('UK-VAT', '20', '1000', '200')])], rates, [
    'vat',
    'gst',
  ]);
  const r = vatReturn(output, [
    { source: 'supplier_bill', rate: '20', base: '300', tax: '60' },
    { source: 'expense', rate: '20', base: '100', tax: '20' },
    { source: 'expense', rate: '5', base: '100', tax: '5' },
  ]);
  assert.equal(r.outputTax, '200.0000');
  assert.equal(r.inputTax, '85.0000');
  assert.equal(r.netPayable, '115.0000');
  assert.deepEqual(
    r.input.map((i) => [i.rate, i.tax]),
    [
      ['5', '5.0000'],
      ['20', '80.0000'],
    ],
  );
  assert.equal(
    vatReturn([], [{ source: 'expense', rate: '20', base: '50', tax: '10' }]).netPayable,
    '-10.0000',
  );
  assert.equal(vatReturn([], []).netPayable, '0.0000');
});

check(
  'withholding by payee: only invoices with withholding, biggest first, mixed rates shown',
  () => {
    const rows = withholdingByPayee([
      inv('1', 'Acme', [], '50', '500'),
      inv('2', 'Acme', [], '25', '250'),
      inv('3', 'Zed', [], '100', '1000'),
      inv('4', 'None', [], '0', '900'),
    ]);
    assert.deepEqual(
      rows.map((r) => r.payee),
      ['Zed', 'Acme'],
    );
    assert.equal(rows[1]?.withheld, '75.0000');
    assert.equal(rows[1]?.gross, '750.0000');
    assert.equal(rows[1]?.invoices, 2);
    assert.equal(rows[1]?.rate, '10');
    const mixed = withholdingByPayee([
      { ...inv('1', 'M', [], '5', '50'), withholdingRate: '10' },
      { ...inv('2', 'M', [], '5', '25'), withholdingRate: '20' },
    ]);
    assert.equal(mixed[0]?.rate, 'mixed');
  },
);

check('quarterly provision: rate on profit, nothing on a loss, no carry forward', () => {
  assert.equal(quarterOf('2026-01-15'), 1);
  assert.equal(quarterOf('2026-12-31'), 4);
  const p = provision(
    [
      { quarter: '2026 Q1', preTaxIncome: '10000' },
      { quarter: '2026 Q2', preTaxIncome: '-5000' },
      { quarter: '2026 Q3', preTaxIncome: '2000' },
    ],
    '21',
  );
  assert.deepEqual(
    p.map((r) => r.provision),
    ['2100.0000', '0.0000', '420.0000'],
  );
  assert.equal(p[2]?.cumulative, '2520.0000');
  assert.equal(provision([{ quarter: 'Q', preTaxIncome: '100' }], '0')[0]?.provision, '0.0000');
});

check('paid against due by jurisdiction', () => {
  const r = paidVsDue(
    [
      { jurisdiction: 'US-CA', amount: '500' },
      { jurisdiction: 'US-CA', amount: '100' },
      { jurisdiction: 'GB', amount: '200' },
    ],
    [
      { jurisdiction: 'US-CA', amount: '450' },
      { jurisdiction: 'US-NY', amount: '30' },
    ],
  );
  assert.deepEqual(
    r.map((x) => [x.jurisdiction, x.due, x.paid, x.balance]),
    [
      ['GB', '200.0000', '0.0000', '200.0000'],
      ['US-CA', '600.0000', '450.0000', '150.0000'],
      ['US-NY', '0.0000', '30.0000', '-30.0000'],
    ],
  );
});

check('deadline reminders: once before, once on the day, never when done', () => {
  assert.equal(reminderStage('2026-04-30', '2026-04-01', 7, 0, false), null);
  assert.equal(reminderStage('2026-04-30', '2026-04-23', 7, 0, false), 1);
  assert.equal(reminderStage('2026-04-30', '2026-04-24', 7, 1, false), null);
  assert.equal(reminderStage('2026-04-30', '2026-04-30', 7, 1, false), 2);
  assert.equal(reminderStage('2026-04-30', '2026-05-02', 7, 2, false), null);
  assert.equal(reminderStage('2026-04-30', '2026-05-02', 7, 0, false), 2);
  assert.equal(reminderStage('2026-04-30', '2026-04-30', 7, 0, true), null);
  assert.equal(reminderStage('2026-04-30', '2026-04-30', 0, 0, false), 2);
});

check('strict inputs for settings, payments and deadlines', () => {
  assert.ok(filingSettingsInput.safeParse({ provisionRate: '21', reminderDays: 7 }).success);
  assert.ok(!filingSettingsInput.safeParse({ provisionRate: '101', reminderDays: 7 }).success);
  assert.ok(!filingSettingsInput.safeParse({ provisionRate: '21', reminderDays: 61 }).success);
  const pay = {
    jurisdiction: 'US-CA',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    amount: '500',
    paidOn: '2026-04-20',
  };
  assert.ok(paymentInput.safeParse(pay).success);
  assert.ok(!paymentInput.safeParse({ ...pay, amount: '0' }).success);
  assert.ok(!paymentInput.safeParse({ ...pay, periodEnd: '2025-12-31' }).success);
  assert.ok(!paymentInput.safeParse({ ...pay, jurisdiction: '<b>' }).success);
  assert.ok(!paymentInput.safeParse({ ...pay, taxKind: 'crypto' }).success);
  assert.ok(deadlineInput.safeParse({ title: 'Q1 return', dueOn: '2026-04-30' }).success);
  assert.ok(!deadlineInput.safeParse({ title: 'Q1 return', dueOn: '2026-02-30' }).success);
  assert.ok(deadlineUpdate.safeParse({ version: 1, status: 'done' }).success);
  assert.ok(!deadlineUpdate.safeParse({ version: 1, status: 'late' }).success);
});

const manifestFor = (sections: ReturnType<typeof sectionOf>[], ok = true): Manifest => ({
  version: 1,
  companyId: 'c',
  companyName: 'Co',
  period: { from: '2026-01-01', to: '2026-12-31' },
  generatedAt: '2026-10-23T00:00:00.000Z',
  generatedBy: 'u',
  sections: sections.map((s) => s.section),
  chain: {
    ok,
    checkedFrom: '1',
    checkedTo: '10',
    firstBrokenSequence: ok ? null : '4',
    gaps: [],
    headSequence: '10',
    headHash: 'h',
  },
  notes: [],
});

check('audit pack: sections and manifest checksums, tampering is found', () => {
  const entries = sectionOf('journal_entries', [
    { id: 'e1', total: '100' },
    { id: 'e2', total: '50' },
  ]);
  const lines = sectionOf('journal_lines', [{ entry: 'e1', debit: '100' }]);
  assert.equal(entries.section.rows, 2);
  assert.equal(entries.section.sha256, sha256Hex(entries.json));
  const manifest = manifestFor([entries, lines]);
  const m = manifestOf(manifest);
  assert.equal(m.sha256, manifestOf(manifest).sha256);
  const file = {
    manifest,
    manifestSha256: m.sha256,
    sections: {
      journal_entries: JSON.parse(entries.json) as unknown[],
      journal_lines: JSON.parse(lines.json) as unknown[],
    },
  };
  assert.deepEqual(checkPack(file), { ok: true, problems: [] });
  const edited = {
    ...file,
    sections: { ...file.sections, journal_lines: [{ entry: 'e1', debit: '1' }] },
  };
  assert.match(checkPack(edited).problems.join(' '), /journal_lines does not match/);
  const dropped = { ...file, sections: { journal_entries: file.sections.journal_entries } };
  assert.match(checkPack(dropped).problems.join(' '), /journal_lines is missing/);
  const shortRows = {
    ...file,
    sections: { ...file.sections, journal_entries: file.sections.journal_entries.slice(0, 1) },
  };
  assert.match(checkPack(shortRows).problems.join(' '), /has 1 rows/);
  const forged = { ...file, manifest: { ...manifest, companyName: 'Other' } };
  assert.match(checkPack(forged).problems.join(' '), /manifest does not match/);
  const broken = manifestFor([entries, lines], false);
  const brokenFile = {
    manifest: broken,
    manifestSha256: manifestOf(broken).sha256,
    sections: file.sections,
  };
  assert.match(checkPack(brokenFile).problems.join(' '), /audit chain check did not pass/);
});

check('audit pack input: a period of at most about a year', () => {
  assert.ok(packInput.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success);
  assert.ok(!packInput.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success);
  assert.ok(!packInput.safeParse({ from: '2024-01-01', to: '2026-12-31' }).success);
  assert.ok(!packInput.safeParse({ from: '2026-01-01', to: '2026-12-31', extra: 1 }).success);
});

process.stdout.write(`step15-tax: ${checks} checks passed\n`);
