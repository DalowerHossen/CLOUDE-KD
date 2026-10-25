// path: scripts/verify/step16-payout-kinds.ts
// Each way of being paid asks for what it needs: ACH only in the United States with a 9 digit routing number, a wire needs a
// SWIFT code, PayPal needs an e-mail address, and the hint never shows more than the last characters.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-payout-kinds.ts
import assert from 'node:assert/strict';
import { PAYOUT_KINDS, hintFor, kindsForCountry } from '@/lib/payout/method-kinds';
import { methodInput } from '@/services/payout/methods';

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
const ok = (d: Record<string, unknown>): boolean => methodInput.safeParse(d).success;
const base = { label: 'Main', currency: 'USD', holderName: 'Ann Lee' };

check('ACH is offered only in the United States', () => {
  assert.ok(kindsForCountry('US').includes('ach'));
  assert.ok(!kindsForCountry('BD').includes('ach'));
  assert.equal(PAYOUT_KINDS.length, 7);
});
check('an ACH method needs the US, a 9 digit routing number and an account type', () => {
  const ach = { ...base, kind: 'ach', country: 'US', bankName: 'First Bank', routingCode: '021000021', accountNumber: '123456789', accountType: 'checking' };
  assert.ok(ok(ach));
  assert.ok(!ok({ ...ach, country: 'BD' }));
  assert.ok(!ok({ ...ach, routingCode: '1234' }));
  assert.ok(!ok({ ...ach, accountType: undefined }));
  assert.ok(!ok({ ...ach, accountNumber: '12AB' }));
});
check('a wire needs a SWIFT code', () => {
  const wire = { ...base, kind: 'wire', country: 'DE', bankName: 'Bank', accountNumber: 'DE89370400440532013000', swiftCode: 'COBADEFF' };
  assert.ok(ok(wire));
  assert.ok(!ok({ ...wire, swiftCode: undefined }));
});
check('PayPal and Payoneer take an e-mail address or ID, not a bank', () => {
  assert.ok(ok({ ...base, kind: 'paypal', country: 'BD', accountNumber: 'ann@example.com' }));
  assert.ok(!ok({ ...base, kind: 'paypal', country: 'BD', accountNumber: 'not-an-email' }));
  assert.ok(ok({ ...base, kind: 'payoneer', country: 'IN', accountNumber: 'PAYEE12345' }));
});
check('an e-wallet needs a wallet name and number', () => {
  const w = { ...base, kind: 'e_wallet', country: 'PH', bankName: 'Wallet', accountNumber: '+63 912 345 6789' };
  assert.ok(ok(w));
  assert.ok(!ok({ ...w, bankName: undefined }));
});
check('unknown kinds and extra keys are refused', () => {
  assert.ok(!ok({ ...base, kind: 'cash', country: 'US', accountNumber: '12345678' }));
  assert.ok(!ok({ ...base, kind: 'paypal', country: 'BD', accountNumber: 'a@b.co', extra: 1 }));
});
check('hints show only the end or the domain', () => {
  assert.equal(hintFor('ach', '123456789'), 'ending 6789');
  assert.equal(hintFor('paypal', 'ann@example.com'), 'account at example.com');
});

process.stdout.write(`step16-payout-kinds: ${checks} checks passed\n`);
