// path: scripts/verify/step16-mail-throttle.ts
// The mail-with-a-link policies (password reset and e-mail confirmation) exist and are strict enough.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-mail-throttle.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RATE_POLICIES } from '@/config/security';

const perAddress = RATE_POLICIES['mail-link'];
const total = RATE_POLICIES['mail-day'];
assert.ok(perAddress && perAddress.limit <= 3 && perAddress.windowSeconds >= 900);
assert.ok(total && total.limit <= 10 && total.windowSeconds >= 3600);
for (const file of ['services/auth/reset-flow.ts', 'services/auth/signup-flow.ts']) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes("'mail-link'") && source.includes("'mail-day'"), file);
}
process.stdout.write('step16-mail-throttle: 3 checks passed\n');
