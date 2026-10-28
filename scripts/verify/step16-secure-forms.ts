// path: scripts/verify/step16-secure-forms.ts
// The list of processors that can be enabled (those with a card form in code) must match the forms the checkout can load.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-secure-forms.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PROCESSORS_WITH_SECURE_FORM, hasSecureForm } from '@/config/processors';
import { secureFormLoaders } from '@/components/payment/processors/index.generated';
import { PROCESSOR_IDS } from '@/types/contracts';

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

check('the enable list equals the forms the checkout can load', () => {
  assert.deepEqual([...PROCESSORS_WITH_SECURE_FORM].sort(), Object.keys(secureFormLoaders).sort());
});
check('every listed processor has its form file', () => {
  for (const id of PROCESSORS_WITH_SECURE_FORM)
    assert.ok(existsSync(`components/payment/processors/${id}/index.tsx`), id);
});
check('processors without a form are refused and the rest are allowed', () => {
  const without = PROCESSOR_IDS.filter((id) => !hasSecureForm(id));
  assert.equal(hasSecureForm('nmi'), true);
  assert.ok(without.includes('paddle'));
  assert.ok(without.includes('payoneer'));
  assert.equal(hasSecureForm('stripe'), true);
});

process.stdout.write(`step16-secure-forms: ${checks} checks passed\n`);
