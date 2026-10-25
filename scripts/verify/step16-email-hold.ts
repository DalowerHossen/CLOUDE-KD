// path: scripts/verify/step16-email-hold.ts
// A message is held (not failed) while every provider refuses its own settings, so verification and sign-in mails survive a wrong
// SMTP password; after 72 hours it is given up; a temporary problem keeps the normal retry rules.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-email-hold.ts
import assert from 'node:assert/strict';
import { CONFIG_HOLD_HOURS, configHold } from '@/lib/email/hold';

const now = new Date('2026-10-25T12:00:00Z');
const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString();
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

check('a refused sign-in holds a fresh message', () => {
  assert.equal(configHold(true, false, hoursAgo(1), now), 'hold');
  assert.equal(configHold(true, false, null, now), 'hold');
});
check('a message older than the hold time is given up', () => {
  assert.equal(configHold(true, false, hoursAgo(CONFIG_HOLD_HOURS + 1), now), 'give_up');
  assert.equal(configHold(true, false, hoursAgo(CONFIG_HOLD_HOURS - 1), now), 'hold');
});
check('a temporary problem, or no settings problem, keeps the normal retry rules', () => {
  assert.equal(configHold(true, true, hoursAgo(1), now), 'none');
  assert.equal(configHold(false, true, hoursAgo(1), now), 'none');
  assert.equal(configHold(false, false, hoursAgo(1), now), 'none');
});

process.stdout.write(`step16-email-hold: ${checks} checks passed\n`);
