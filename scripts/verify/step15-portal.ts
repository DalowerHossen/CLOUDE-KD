// path: scripts/verify/step15-portal.ts
// Logic checks of the employee portal rules (15.9) that need no database: the link input (short expiry, code on by default), the
// declaration inputs and the shape of the token in the portal request, the decision, the payslips an employee may see, how an
// approved declaration changes the tax details, and the link address. That a payslip opens only through a valid link, and that an
// expired, revoked or unknown link gives the same answer, is decided by the tokens service and the portal door
// (`resolvePortalAccess`) and needs a running app; the table rules are in sql/assertions/s15_012_employee_portal.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-portal.ts
import assert from 'node:assert/strict';
import {
  MAX_LINK_DAYS,
  declarationInput,
  decideDeclarationInput,
  linkInput,
  mergeDeclaration,
  portalDeclarationBody,
  portalUrl,
  visiblePayslips,
  type PortalItem,
} from '@/services/payroll/portal-rules';

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

const TOKEN = `${'a'.repeat(22)}.${'B'.repeat(22)}`;

check('employee links expire quickly and ask for a code by default', () => {
  const d = linkInput.parse({});
  assert.equal(d.ttlDays, 3);
  assert.equal(d.otpRequired, true);
  assert.equal(MAX_LINK_DAYS, 14);
  assert.ok(linkInput.safeParse({ ttlDays: 14 }).success);
  assert.ok(!linkInput.safeParse({ ttlDays: 15 }).success);
  assert.ok(!linkInput.safeParse({ ttlDays: 0 }).success);
  assert.ok(!linkInput.safeParse({ ttlDays: 2.5 }).success);
  assert.ok(!linkInput.safeParse({ extra: true }).success);
});

check('declaration: filing status, allowances 0 to 50, no markup, strict', () => {
  assert.ok(declarationInput.safeParse({ filingStatus: 'single', allowances: 2 }).success);
  assert.ok(!declarationInput.safeParse({ filingStatus: '', allowances: 2 }).success);
  assert.ok(!declarationInput.safeParse({ filingStatus: 'single', allowances: 51 }).success);
  assert.ok(!declarationInput.safeParse({ filingStatus: 'single', allowances: -1 }).success);
  assert.ok(!declarationInput.safeParse({ filingStatus: '<b>', allowances: 1 }).success);
  assert.ok(
    !declarationInput.safeParse({ filingStatus: 'single', allowances: 1, employeeId: 'x' }).success,
  );
});

check(
  'the portal request carries a well-formed token and nothing about who the employee is',
  () => {
    assert.ok(
      portalDeclarationBody.safeParse({ token: TOKEN, filingStatus: 'single', allowances: 1 })
        .success,
    );
    assert.ok(
      !portalDeclarationBody.safeParse({ token: 'short', filingStatus: 'single', allowances: 1 })
        .success,
    );
    assert.ok(
      !portalDeclarationBody.safeParse({
        token: `${TOKEN}!`,
        filingStatus: 'single',
        allowances: 1,
      }).success,
    );
    assert.ok(
      !portalDeclarationBody.safeParse({
        token: TOKEN,
        filingStatus: 'single',
        allowances: 1,
        employeeId: '11111111-1111-4111-8111-111111111111',
      }).success,
    );
  },
);

check('a rejection needs a reason, an approval does not', () => {
  assert.ok(decideDeclarationInput.safeParse({ decision: 'approve' }).success);
  assert.ok(!decideDeclarationInput.safeParse({ decision: 'reject' }).success);
  assert.ok(decideDeclarationInput.safeParse({ decision: 'reject', reason: 'Not clear' }).success);
  assert.ok(!decideDeclarationInput.safeParse({ decision: 'maybe' }).success);
});

const item = (
  id: string,
  end: string,
  run: string,
  status: string,
  hasFile: boolean,
): PortalItem => ({
  itemId: id,
  runNumber: run,
  periodStart: `${end.slice(0, 8)}01`,
  periodEnd: end,
  payDate: end,
  net: '1000.0000',
  runStatus: status,
  hasFile,
});

check('an employee sees payslips of approved and paid runs that have a file, newest first', () => {
  const list = visiblePayslips([
    item('1', '2026-02-28', 'PR-2026-0002', 'paid', true),
    item('2', '2026-04-30', 'PR-2026-0004', 'approved', true),
    item('3', '2026-03-31', 'PR-2026-0003', 'submitted', true),
    item('4', '2026-01-31', 'PR-2026-0001', 'paid', false),
    item('5', '2026-03-31', 'PR-2026-0003', 'draft', true),
    item('6', '2026-03-31', 'PR-2026-0003', 'paid', true),
  ]);
  assert.deepEqual(
    list.map((i) => i.itemId),
    ['2', '6', '1'],
  );
  assert.deepEqual(visiblePayslips([]), []);
});

check('an approved declaration changes status and allowances and keeps the tax id', () => {
  const merged = mergeDeclaration(
    { taxId: 'AB-123456', filingStatus: 'single', allowances: 0 },
    { filingStatus: 'married', allowances: 3 },
  );
  assert.deepEqual(merged, { taxId: 'AB-123456', filingStatus: 'married', allowances: 3 });
  assert.equal(mergeDeclaration(null, { filingStatus: 'married', allowances: 3 }), null);
});

check('the link address keeps the token as one path part', () => {
  assert.equal(portalUrl('https://app.example.com', TOKEN), `https://app.example.com/p/${TOKEN}`);
  assert.equal(portalUrl('https://app.example.com', 'a/b'), 'https://app.example.com/p/a%2Fb');
});

process.stdout.write(`step15-portal: ${checks} checks passed\n`);
