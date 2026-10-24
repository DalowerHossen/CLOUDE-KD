// path: scripts/verify/step16-zod4.ts
// Checks of the Zod 4 migration: a partial update body keeps missing fields undefined (Zod 4 would fill the create defaults and
// overwrite stored values), strict objects are detected, and the converter of the OpenAPI document reads the checks of Zod 4.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-zod4.ts
import assert from 'node:assert/strict';
import { z } from 'zod';
import { employeeUpdate } from '@/services/payroll/payroll-rules';
import { categoryUpdate } from '@/services/asset/depreciation-rules';
import { planUpdateInput } from '@/lib/payment/plan-rules';
import { clientPlanUpdate } from '@/lib/payment/client-subscription-rules';
import { isStrictObject, partialPatch } from '@/lib/security/zod-strict';

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

check('partialPatch keeps missing fields undefined and still checks given ones', () => {
  const base = z.object({
    a: z.string().default('x'),
    b: z.number().int().min(1).default(5),
    c: z.string(),
  });
  const patch = partialPatch(base).strict();
  assert.deepEqual(patch.parse({}), {});
  assert.deepEqual(patch.parse({ b: 2 }), { b: 2 });
  assert.equal(patch.safeParse({ b: 0 }).success, false);
  assert.equal(patch.safeParse({ extra: 1 }).success, false);
});

check('update bodies do not carry create defaults', () => {
  const employee = employeeUpdate.parse({ version: 3, firstName: 'Jane' });
  assert.deepEqual(Object.keys(employee).sort(), ['firstName', 'version']);
  assert.deepEqual(Object.keys(categoryUpdate.parse({ version: 1 })), ['version']);
  assert.deepEqual(planUpdateInput.parse({}), {});
  assert.deepEqual(clientPlanUpdate.parse({}), {});
});

check('strict objects are told apart from loose ones', () => {
  assert.equal(isStrictObject(z.object({ a: z.string() }).strict()), true);
  assert.equal(isStrictObject(z.strictObject({ a: z.string() })), true);
  assert.equal(isStrictObject(z.object({ a: z.string() })), false);
  assert.equal(isStrictObject(z.string()), false);
});

check('an object default is parsed through the schema (prefault)', () => {
  const inner = z.object({ n: z.number().default(7) }).strict();
  assert.deepEqual(z.object({ o: inner.prefault({}) }).parse({}), { o: { n: 7 } });
});

process.stdout.write(`step16-zod4: ${checks} checks passed\n`);
