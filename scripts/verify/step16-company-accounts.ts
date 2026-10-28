// path: scripts/verify/step16-company-accounts.ts
// A company's own merchant account (S16_040): without a company or an account the platform's credentials are used, the
// inputs are strict, and the webhook address of an account carries its id.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-company-accounts.ts
import assert from 'node:assert/strict';
import { accountActionInput, saveAccountInput } from '@/lib/payment/company-accounts-rules';
import { accountWebhookPath, resolveCredentials } from '@/services/payment/company-accounts';

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

async function main(): Promise<void> {
  await check('without a company the platform credentials are used', async () => {
    const used = await resolveCredentials({
      processorId: 'nmi',
      companyId: null,
      platform: async () => ({ values: { privateKey: 'platform' }, environment: 'sandbox' }),
    });
    assert.deepEqual(used, {
      values: { privateKey: 'platform' },
      environment: 'sandbox',
      accountId: null,
    });
  });
  await check('inputs are strict', () => {
    const ok = {
      companyId: '0190c4a2-7b7e-7c8e-9a52-3f0d2a1b4c5d',
      processorId: 'nmi',
      environment: 'sandbox',
      values: { privateKey: 'abc' },
    };
    assert.equal(saveAccountInput.safeParse(ok).success, true);
    assert.equal(saveAccountInput.safeParse({ ...ok, extra: 1 }).success, false);
    assert.equal(saveAccountInput.safeParse({ ...ok, environment: 'prod' }).success, false);
    assert.equal(saveAccountInput.safeParse({ ...ok, values: { 'bad key': 'x' } }).success, false);
    assert.equal(accountActionInput.safeParse({ action: 'delete' }).success, false);
    assert.equal(accountActionInput.safeParse({ action: 'test' }).success, true);
  });
  await check('the webhook address of an account carries its id', () => {
    assert.equal(
      accountWebhookPath('nmi', '0190c4a2-7b7e-7c8e-9a52-3f0d2a1b4c5d'),
      '/api/webhooks/account/nmi/0190c4a2-7b7e-7c8e-9a52-3f0d2a1b4c5d',
    );
  });
  process.stdout.write(`step16-company-accounts: ${checks} checks passed\n`);
}

void main();
