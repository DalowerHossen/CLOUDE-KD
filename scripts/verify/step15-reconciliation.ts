// path: scripts/verify/step15-reconciliation.ts
// Logic checks of bank reconciliation (15.6) that need no database: reading CSV, OFX and QFX statements into the same lines,
// dates and amounts in odd formats, dedupe keys that survive overlapping files, the match score, suggestions, automatic pairs
// (clear winners only, a journal line once), bank rules, and the entry for a booked bank line. That a journal line matches once,
// the status follows the matches and a completed reconciliation locks its lines is checked in the database by
// sql/assertions/s15_006_reconciliation.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-reconciliation.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import {
  autoPairs,
  categorizeLines,
  ruleFor,
  scorePair,
  suggest,
  type BankLine,
  type BankRule,
  type BookLine,
} from '@/services/reconciliation/matching-rules';
import {
  dedupeKeys,
  detectFormat,
  parseAmount,
  parseBankCsv,
  parseDay,
  parseOfx,
  parseStatement,
} from '@/services/reconciliation/statement-parsers';
import {
  bankAccountInput,
  importInput,
  ruleInput,
  startInput,
} from '@/services/reconciliation/inputs';

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

check('amounts in the forms banks use', () => {
  assert.equal(parseAmount('1,234.56')?.toDbString(), '1234.5600');
  assert.equal(parseAmount('(12.00)')?.toDbString(), '-12.0000');
  assert.equal(parseAmount('-12')?.toDbString(), '-12.0000');
  assert.equal(parseAmount('$ 12.5')?.toDbString(), '12.5000');
  assert.equal(parseAmount('12.00-')?.toDbString(), '-12.0000');
  assert.equal(parseAmount('+7')?.toDbString(), '7.0000');
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('1.23456'), null);
});

check('dates in the chosen format, real dates only', () => {
  assert.equal(parseDay('2026-10-31', 'iso'), '2026-10-31');
  assert.equal(parseDay('10/31/2026', 'mdy'), '2026-10-31');
  assert.equal(parseDay('31/10/2026', 'dmy'), '2026-10-31');
  assert.equal(parseDay('31.10.26', 'dmy'), '2026-10-31');
  assert.equal(parseDay('02/30/2026', 'mdy'), null);
  assert.equal(parseDay('31/10/2026', 'mdy'), null);
  assert.equal(parseDay('hello', 'iso'), null);
});

const CSV = [
  'Date,Description,Amount,Balance',
  '2026-10-05,Customer payment INV-12,500.00,1500.00',
  '2026-10-08,Bank fee,-25.00,1475.00',
  '2026-10-09,Bad date row,10,1485',
  '2026-13-01,Wrong,1,1',
  '2026-10-10,Zero,0,1485',
].join('\n');

check('a CSV statement: good lines kept, bad lines listed with their line number', () => {
  const r = parseBankCsv(CSV, 'iso');
  assert.equal(r.transactions.length, 3);
  assert.deepEqual(
    r.transactions.map((t) => t.amount),
    ['500.0000', '-25.0000', '10.0000'],
  );
  assert.deepEqual(
    r.errors.map((e) => e.line),
    [5, 6],
  );
  assert.equal(r.endingBalance, '1485.0000');
  const split = parseBankCsv(
    'Posting Date,Details,Debit,Credit\n10/05/2026,Rent,800.00,\n10/06/2026,Sale,,120.00',
    'mdy',
  );
  assert.deepEqual(
    split.transactions.map((t) => t.amount),
    ['-800.0000', '120.0000'],
  );
  assert.equal(parseBankCsv('foo,bar\n1,2', 'iso').errors.length, 1);
  assert.equal(
    parseBankCsv(
      'Date,Description,Amount\n2026-10-05,<script>x</script>,5',
      'iso',
    ).transactions[0]?.description.includes('<'),
    false,
    'markup is removed',
  );
});

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005120000<TRNAMT>500.00<FITID>A1<NAME>Customer<MEMO>Payment INV-12</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008<TRNAMT>-25.00<FITID>A2<NAME>Bank fee</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026<TRNAMT>-1.00<FITID>A3<NAME>No date</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>1475.00<DTASOF>20261008</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

check('OFX and QFX give the same lines as the CSV', () => {
  const r = parseOfx(OFX, 'ofx');
  assert.deepEqual(
    r.transactions.map((t) => [t.date, t.amount, t.externalId]),
    [
      ['2026-10-05', '500.0000', 'A1'],
      ['2026-10-08', '-25.0000', 'A2'],
    ],
  );
  assert.equal(r.transactions[0]?.description, 'Customer Payment INV-12');
  assert.equal(r.endingBalance, '1475.0000');
  assert.equal(r.errors.length, 1);
  assert.equal(parseOfx(OFX.replace('USD', 'EUR'), 'ofx').transactions.length, 0, 'only USD');
  assert.equal(parseOfx('<OFX></OFX>', 'qfx').errors.length, 1);
  assert.equal(detectFormat('x.QFX', ''), 'qfx');
  assert.equal(detectFormat('statement.txt', OFX), 'ofx');
  assert.equal(detectFormat('a.csv', 'Date,Amount'), 'csv');
  assert.equal(parseStatement('a.ofx', OFX, 'iso').format, 'ofx');
});

check(
  'the same line has the same key in an overlapping file; identical lines in one file stay apart',
  () => {
    const a = parseBankCsv(
      'Date,Description,Amount\n2026-10-05,Coffee,-4\n2026-10-05,Coffee,-4\n2026-10-06,Rent,-800',
      'iso',
    ).transactions;
    const b = parseBankCsv(
      'Date,Description,Amount\n2026-10-05,Coffee,-4\n2026-10-05,Coffee,-4\n2026-10-06,Rent,-800\n2026-10-07,New,-1',
      'iso',
    ).transactions;
    const ka = dedupeKeys('acc', a);
    const kb = dedupeKeys('acc', b);
    assert.equal(new Set(ka).size, 3, 'two identical coffees are two lines');
    assert.deepEqual(kb.slice(0, 3), ka, 'the overlap has the same keys');
    assert.notEqual(dedupeKeys('other', a)[0], ka[0], 'another account, another key');
    const withId = parseOfx(OFX, 'ofx').transactions;
    assert.equal(
      dedupeKeys('acc', withId)[0],
      dedupeKeys(
        'acc',
        withId.map((t) => ({ ...t, description: 'changed text' })),
      )[0],
      'a bank id decides, not the text',
    );
  },
);

const line = (
  id: string,
  date: string,
  amount: string,
  memo: string,
  number = 'JE-1',
): BookLine => ({
  lineId: id,
  entryId: `e-${id}`,
  entryNumber: number,
  date,
  amount,
  memo,
  description: '',
});
const bank = (
  id: string,
  date: string,
  amount: string,
  description: string,
  reference = '',
): BankLine => ({ id, date, amount, description, reference });

check('a pair needs the same amount; date and shared words raise the score', () => {
  const t = bank('t', '2026-10-05', '500', 'Customer payment INV-12');
  assert.equal(scorePair(t, line('a', '2026-10-05', '499', 'Sale')), null);
  assert.equal(
    scorePair(t, line('a', '2026-12-31', '500', 'Sale')),
    null,
    'more than 45 days apart',
  );
  const same = scorePair(t, line('a', '2026-10-05', '500', 'Payment for INV-12 customer'));
  const near = scorePair(t, line('a', '2026-10-08', '500', 'Payment for INV-12 customer'));
  const far = scorePair(t, line('a', '2026-10-25', '500', 'Sale'));
  assert.ok(same && near && far);
  assert.ok(same.score > near.score && near.score > far.score);
  assert.ok(same.reasons.includes('Same date'));
  const withRef = scorePair(
    bank('t', '2026-10-05', '500', 'x', 'INV-12'),
    line('a', '2026-10-05', '500', 'Invoice INV-12'),
  );
  assert.ok(withRef?.reasons.includes('The reference appears in the entry'));
});

check('suggestions are best first; automatic pairs only for a clear winner and a line once', () => {
  const book = [
    line('a', '2026-10-05', '500', 'Payment INV-12 customer', 'JE-1'),
    line('b', '2026-10-20', '500', 'Other sale', 'JE-2'),
    line('c', '2026-10-08', '-25', 'Bank fee', 'JE-3'),
  ];
  const t1 = bank('t1', '2026-10-05', '500', 'Customer payment INV-12');
  assert.deepEqual(
    suggest(t1, book).map((s) => s.lineId),
    ['a', 'b'],
  );
  const t2 = bank('t2', '2026-10-08', '-25', 'Bank fee');
  const pairs = autoPairs([t1, t2], book);
  assert.deepEqual(pairs.map((p) => [p.bankTransactionId, p.lineId]).sort(), [
    ['t1', 'a'],
    ['t2', 'c'],
  ]);
  // two equal candidates: no automatic pair
  const twins = [
    line('x', '2026-10-05', '40', 'Lunch', 'JE-7'),
    line('y', '2026-10-05', '40', 'Lunch', 'JE-8'),
  ];
  assert.deepEqual(autoPairs([bank('t', '2026-10-05', '40', 'Lunch')], twins), []);
  // the same journal line cannot serve two bank lines
  const one = [line('only', '2026-10-05', '40', 'Lunch', 'JE-9')];
  assert.equal(
    autoPairs([bank('t', '2026-10-05', '40', 'Lunch'), bank('u', '2026-10-05', '40', 'Lunch')], one)
      .length,
    1,
  );
  // a weak match is left for the person
  assert.deepEqual(
    autoPairs(
      [bank('w', '2026-09-01', '500', 'Unknown')],
      [line('z', '2026-10-05', '500', 'Sale', 'JE-5')],
    ),
    [],
  );
});

check('rules book a line by its text and direction, per account', () => {
  const rule = (over: Partial<BankRule> = {}): BankRule => ({
    id: 'r',
    name: 'Fees',
    bankAccountId: null,
    containsText: 'bank fee',
    direction: 'any',
    accountId: 'fees',
    memo: '',
    status: 'active',
    ...over,
  });
  const t = bank('t', '2026-10-08', '-25', 'MONTHLY BANK FEE');
  assert.equal(ruleFor([rule()], 'b1', t)?.id, 'r');
  assert.equal(ruleFor([rule({ direction: 'in' })], 'b1', t), null);
  assert.equal(ruleFor([rule({ direction: 'out' })], 'b1', t)?.id, 'r');
  assert.equal(ruleFor([rule({ status: 'inactive' })], 'b1', t), null);
  assert.equal(ruleFor([rule({ bankAccountId: 'b2' })], 'b1', t), null);
  assert.equal(ruleFor([rule({ containsText: 'rent' })], 'b1', t), null);
});

check(
  'a booked bank line makes a balanced entry: a deposit debits the bank, a payment credits it',
  () => {
    const out = categorizeLines(
      { amount: '-25.0000', description: 'Bank fee' },
      'bank',
      'fees',
      '',
    );
    assert.deepEqual(
      out.map((l) => [l.accountId, l.debit, l.credit]),
      [
        ['fees', '25.0000', '0'],
        ['bank', '0', '25.0000'],
      ],
    );
    const inn = categorizeLines(
      { amount: '40.0000', description: 'Interest' },
      'bank',
      'interest',
      'March interest',
    );
    assert.deepEqual(
      inn.map((l) => [l.accountId, l.debit, l.credit]),
      [
        ['bank', '40.0000', '0'],
        ['interest', '0', '40.0000'],
      ],
    );
    assert.equal(inn[0]?.description, 'March interest');
    for (const l of [...out, ...inn])
      assert.ok(Money.parse(l.debit).isPositive() !== Money.parse(l.credit).isPositive());
  },
);

check('inputs are strict', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.ok(
    bankAccountInput.safeParse({ name: 'Main', ledgerAccountId: id, last4: '1234' }).success,
  );
  assert.ok(
    !bankAccountInput.safeParse({ name: 'Main', ledgerAccountId: id, last4: '12345678' }).success,
    'never the full number',
  );
  assert.ok(importInput.safeParse({ bankAccountId: id, fileName: 'a.csv', text: 'x' }).success);
  assert.ok(
    !importInput.safeParse({ bankAccountId: id, fileName: 'a.csv', text: 'x', dateFormat: 'ymd' })
      .success,
  );
  assert.ok(
    startInput.safeParse({
      bankAccountId: id,
      statementDate: '2026-10-31',
      statementBalance: '-12.50',
    }).success,
  );
  assert.ok(
    !startInput.safeParse({
      bankAccountId: id,
      statementDate: '2026-10-31',
      statementBalance: 'abc',
    }).success,
  );
  assert.ok(ruleInput.safeParse({ name: 'Fees', containsText: 'fee', accountId: id }).success);
  assert.ok(!ruleInput.safeParse({ name: 'Fees', containsText: 'f', accountId: id }).success);
});

process.stdout.write(`step15-reconciliation: ${checks} checks passed\n`);
