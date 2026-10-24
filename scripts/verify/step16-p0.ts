// path: scripts/verify/step16-p0.ts
// Checks of the two audit fixes that need no database: the recommend action carries the hand-check flag (default false),
// and production refuses to start without a network intelligence provider and key.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-p0.ts
import assert from 'node:assert/strict';
import { assertProductionNetworkIntel } from '@/lib/env';
import { reviewActionSchema } from '@/lib/kyc/review-input';

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

check('recommend defaults to "not checked by hand" and rejects unknown fields', () => {
  const plain = reviewActionSchema.parse({ action: 'recommend' });
  assert.equal(plain.action === 'recommend' && plain.screeningCheckedByHand, false);
  const hand = reviewActionSchema.parse({ action: 'recommend', screeningCheckedByHand: true });
  assert.equal(hand.action === 'recommend' && hand.screeningCheckedByHand, true);
  assert.equal(reviewActionSchema.safeParse({ action: 'recommend', extra: 1 }).success, false);
  assert.equal(
    reviewActionSchema.safeParse({ action: 'recommend', screeningCheckedByHand: 'yes' }).success,
    false,
  );
});

check('production needs a provider and a key; other environments do not', () => {
  const base = { NETWORK_INTEL_PROVIDER: 'none', NETWORK_INTEL_API_KEY: undefined } as const;
  assert.doesNotThrow(() => assertProductionNetworkIntel({ APP_ENV: 'development', ...base }));
  assert.doesNotThrow(() => assertProductionNetworkIntel({ APP_ENV: 'staging', ...base }));
  assert.throws(() => assertProductionNetworkIntel({ APP_ENV: 'production', ...base }));
  assert.throws(() =>
    assertProductionNetworkIntel({
      APP_ENV: 'production',
      NETWORK_INTEL_PROVIDER: 'ipqualityscore',
      NETWORK_INTEL_API_KEY: undefined,
    }),
  );
  assert.doesNotThrow(() =>
    assertProductionNetworkIntel({
      APP_ENV: 'production',
      NETWORK_INTEL_PROVIDER: 'ipqualityscore',
      NETWORK_INTEL_API_KEY: 'k',
    }),
  );
});

process.stdout.write(`step16-p0: ${checks} checks passed\n`);
