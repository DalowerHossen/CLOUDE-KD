// path: scripts/verify/step16-migration.ts
// Logic checks of the migration wizard (16.10) that need no database: the column presets of the tools matched against the real
// field lists of the clients, products and suppliers imports (with sample files read by the import readers), the dry run report
// (skip or make again, repeats in the file, records that exist), the default value for a required field, batches, the 24 hour
// rollback window, and the strict inputs. The services (writing in batches through the owning services, the rollback of exactly the
// created rows), the cron job and the pages need a running app and are not covered here; the job and row rules are tested in
// sql/assertions/s16_011_migration.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-migration.ts
import assert from 'node:assert/strict';
import {
  buildReport,
  hoursLeft,
  nextBatch,
  presetFor,
  rollbackOpen,
  startInput,
  suggestWithPreset,
  uploadInput,
  validateInput,
  windowEnd,
  type RowCheck,
} from '@/lib/migration/rules';
import { MIGRATION_SOURCES } from '@/config/s16-migration';
import { parseCsv } from '@/lib/transfer/csv';
import { applyMapping, missingRequired, splitTable } from '@/lib/transfer/mapping';
import {
  CLIENT_FIELDS,
  PRODUCT_FIELDS,
  SUPPLIER_FIELDS,
  parseClientRow,
  parseProductRow,
} from '@/lib/transfer/targets';

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

const plain = (
  fields: readonly { key: string; label: string; aliases: readonly string[] }[],
): { key: string; label: string; aliases: readonly string[] }[] =>
  fields.map((f) => ({ key: f.key, label: f.label, aliases: f.aliases }));

check('every preset field exists in the field list of its target (no typo in a key)', () => {
  const keys = {
    clients: new Set(CLIENT_FIELDS.map((f) => f.key)),
    products: new Set(PRODUCT_FIELDS.map((f) => f.key)),
    suppliers: new Set(SUPPLIER_FIELDS.map((f) => f.key)),
  };
  for (const source of MIGRATION_SOURCES)
    for (const target of ['clients', 'products', 'suppliers'] as const)
      for (const key of Object.keys(presetFor(source, target)))
        assert.ok(keys[target].has(key), `${source}/${target}: ${key}`);
});

const QB_CLIENTS = [
  'Customer,Main Email,Main Phone,Bill Address Street,Bill Address City,Bill Address State,Bill Address Postal Code,Bill Address Country,Open Balance,Notes on file',
  'Acme Ltd,billing@acme.test,555-0100,1 Main St,Austin,TX,78701,US,120.50,vip',
  'Beta LLC,not-an-email,555-0101,2 Side St,Dallas,TX,75001,US,0,',
  'Acme Ltd,billing@acme.test,555-0100,1 Main St,Austin,TX,78701,US,120.50,again',
].join('\n');

check(
  'QuickBooks customer file: the preset maps the columns and the rows are checked with the real rules',
  () => {
    const table = splitTable(parseCsv(QB_CLIENTS));
    const mapping = suggestWithPreset('quickbooks', 'clients', table.headers, plain(CLIENT_FIELDS));
    assert.equal(mapping.name, 'Customer');
    assert.equal(mapping.email, 'Main Email');
    assert.equal(mapping.billing_postal_code, 'Bill Address Postal Code');
    assert.equal(mapping.billing_country, 'Bill Address Country');
    assert.equal(mapping.opening_balance, 'Open Balance');
    assert.equal(
      mapping.notes,
      undefined,
      'a column that is not in the preset or the generic names is left to the owner',
    );
    assert.deepEqual(missingRequired(CLIENT_FIELDS, mapping), []);
    const rows = applyMapping(table.headers, table.data, mapping);
    const parsed = rows.map((r) => parseClientRow(r));
    assert.equal(parsed[0]?.ok, true);
    assert.equal(parsed[1]?.ok, false, 'a bad e-mail address is a problem of that row only');
    assert.equal(parsed[2]?.ok, true);
  },
);

check(
  'a column is used for one field only, and the generic names still work without a preset',
  () => {
    const headers = ['Name', 'E-mail', 'Zip', 'Country'];
    const m = suggestWithPreset('generic', 'clients', headers, plain(CLIENT_FIELDS));
    assert.deepEqual(
      [m.name, m.email, m.billing_postal_code, m.billing_country],
      ['Name', 'E-mail', 'Zip', 'Country'],
    );
    const twice = suggestWithPreset(
      'xero',
      'clients',
      ['*ContactName', 'EmailAddress', 'EmailAddress '],
      plain(CLIENT_FIELDS),
    );
    assert.equal(Object.values(twice).filter((v) => v === 'EmailAddress').length, 1);
    assert.equal(twice.name, '*ContactName');
  },
);

check('Xero and Zoho item files map to the product fields', () => {
  const xero = suggestWithPreset(
    'xero',
    'products',
    ['*ItemCode', 'ItemName', 'SalesDescription', 'SalesUnitPrice', 'PurchasesUnitPrice'],
    plain(PRODUCT_FIELDS),
  );
  assert.deepEqual(
    [xero.sku, xero.name, xero.unit_price, xero.cost_price],
    ['*ItemCode', 'ItemName', 'SalesUnitPrice', 'PurchasesUnitPrice'],
  );
  const zoho = suggestWithPreset(
    'zoho',
    'products',
    ['Item Name', 'SKU', 'Rate', 'Purchase Rate'],
    plain(PRODUCT_FIELDS),
  );
  assert.deepEqual(
    [zoho.name, zoho.sku, zoho.unit_price, zoho.cost_price],
    ['Item Name', 'SKU', 'Rate', 'Purchase Rate'],
  );
  const table = splitTable(parseCsv('Item Name,SKU,Rate\nWidget,W-1,9.99\nBad,,abc'));
  const rows = applyMapping(table.headers, table.data, {
    name: 'Item Name',
    sku: 'SKU',
    unit_price: 'Rate',
  });
  assert.equal(parseProductRow(rows[0] ?? {}).ok, true);
  assert.equal(parseProductRow(rows[1] ?? {}).ok, false);
});

check('a default fills a field the file does not have (country of every client)', () => {
  const table = splitTable(parseCsv('Customer,Zip\nAcme,78701'));
  const mapping = suggestWithPreset('quickbooks', 'clients', table.headers, plain(CLIENT_FIELDS));
  const missing = missingRequired(CLIENT_FIELDS, mapping);
  assert.deepEqual(missing, ['Billing country code']);
  const rows = applyMapping(table.headers, table.data, mapping).map((r) => ({
    ...r,
    billing_country: r.billing_country || 'US',
  }));
  assert.equal(parseClientRow(rows[0] ?? {}).ok, true);
});

const c = (
  row: number,
  errors: string[] | null,
  fileKey: string | null,
  existsInSystem: boolean,
): RowCheck => ({ row, errors, fileKey, existsInSystem });

check(
  'dry run report: skip or make again; repeats in the file; records that exist; problems listed',
  () => {
    const rows = [
      c(2, null, 'a@x.test', false),
      c(3, ['The e-mail is not valid.'], null, false),
      c(4, null, 'a@x.test', false),
      c(5, null, 'b@x.test', true),
      c(6, null, 'c@x.test', false),
    ];
    const extra = { unmappedColumns: ['Notes'], blankOptional: { Phone: 2 } };
    const skip = buildReport(rows, 'skip', extra);
    assert.deepEqual(
      [
        skip.total,
        skip.valid,
        skip.invalid,
        skip.duplicatesInFile,
        skip.duplicatesInSystem,
        skip.wouldCreate,
        skip.wouldSkip,
      ],
      [5, 4, 1, 1, 1, 2, 2],
    );
    assert.deepEqual(skip.problems, [{ row: 3, messages: ['The e-mail is not valid.'] }]);
    assert.ok(skip.warnings.some((w) => /Notes/.test(w)));
    assert.ok(skip.warnings.some((w) => /2 row\(s\) have no Phone/.test(w)));
    const again = buildReport(rows, 'create', extra);
    assert.deepEqual([again.wouldCreate, again.wouldSkip], [4, 0]);
    assert.ok(again.warnings.some((w) => /exist already and will be made again/.test(w)));
    const many = buildReport(
      Array.from({ length: 80 }, (_, i) => c(i + 2, ['bad'], null, false)),
      'skip',
      { unmappedColumns: [], blankOptional: {} },
    );
    assert.equal(many.problems.length, 50);
    assert.equal(many.invalid, 80);
  },
);

check('batches walk the file once, never past the end', () => {
  assert.deepEqual(nextBatch(0, 250), { from: 0, to: 100 });
  assert.deepEqual(nextBatch(100, 250), { from: 100, to: 200 });
  assert.deepEqual(nextBatch(200, 250), { from: 200, to: 250 });
  assert.deepEqual(nextBatch(250, 250), { from: 250, to: 250 });
  assert.deepEqual(nextBatch(0, 30), { from: 0, to: 30 });
  assert.deepEqual(nextBatch(10, 1000, 50), { from: 10, to: 60 });
});

check('rollback window: 24 hours after the import stopped writing', () => {
  const end = new Date('2026-03-02T10:00:00Z');
  const until = windowEnd(end).toISOString();
  assert.equal(until, '2026-03-03T10:00:00.000Z');
  assert.equal(rollbackOpen({ rollbackUntil: until }, new Date('2026-03-03T09:59:59Z')), true);
  assert.equal(rollbackOpen({ rollbackUntil: until }, new Date('2026-03-03T10:00:01Z')), false);
  assert.equal(rollbackOpen({ rollbackUntil: null }, end), false);
  assert.equal(hoursLeft({ rollbackUntil: until }, new Date('2026-03-02T12:30:00Z')), 21);
  assert.equal(hoursLeft({ rollbackUntil: until }, new Date('2026-03-04T00:00:00Z')), 0);
});

check('inputs are strict: upload, dry run and start', () => {
  const ok = {
    source: 'xero',
    target: 'clients',
    fileName: 'contacts.csv',
    dataBase64: 'QUJDREVGR0g=',
  };
  assert.ok(uploadInput.safeParse(ok).success);
  assert.ok(!uploadInput.safeParse({ ...ok, source: 'sage' }).success);
  assert.ok(!uploadInput.safeParse({ ...ok, target: 'invoices' }).success);
  assert.ok(!uploadInput.safeParse({ ...ok, fileName: 'contacts.pdf' }).success);
  assert.ok(!uploadInput.safeParse({ ...ok, fileName: '../contacts.csv' }).success);
  assert.ok(!uploadInput.safeParse({ ...ok, dataBase64: 'not base64!' }).success);
  assert.ok(!uploadInput.safeParse({ ...ok, extra: 1 }).success);
  assert.ok(
    validateInput.safeParse({ mapping: { name: 'Customer' }, duplicateMode: 'skip' }).success,
  );
  assert.ok(
    validateInput.safeParse({
      mapping: {},
      duplicateMode: 'create',
      defaults: { billing_country: 'US' },
    }).success,
  );
  assert.ok(
    !validateInput.safeParse({ mapping: {}, duplicateMode: 'overwrite' }).success,
    'overwriting would make a rollback unsafe',
  );
  assert.ok(
    !validateInput.safeParse({
      mapping: {},
      duplicateMode: 'skip',
      defaults: { opening_balance: '5' },
    }).success,
  );
  assert.ok(
    !validateInput.safeParse({
      mapping: {},
      duplicateMode: 'skip',
      defaults: { billing_country: '<US>' },
    }).success,
  );
  assert.ok(startInput.safeParse({ expectedCreate: 12 }).success);
  assert.ok(!startInput.safeParse({ expectedCreate: 0 }).success);
  assert.ok(!startInput.safeParse({ expectedCreate: 5001 }).success);
});

process.stdout.write(`step16-migration: ${checks} checks passed\n`);
