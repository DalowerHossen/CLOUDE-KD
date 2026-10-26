// path: scripts/verify/step16-admin-health.ts
// The health score of the admin home: 100 when nothing is wrong, each signal has a cap, the score never leaves 0 to 100, and
// the levels follow the thresholds.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-admin-health.ts
import assert from 'node:assert/strict';
import { healthScore } from '@/lib/admin/health-score';

const ok = { databaseOk: true, alertsCritical: 0, alertsHigh: 0, incidentsOpen: 0, siemFailing: 0 };
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

check('nothing wrong is 100 and good', () => {
  const r = healthScore(ok);
  assert.equal(r.score, 100);
  assert.equal(r.level, 'good');
  assert.deepEqual(r.reasons, []);
});
check('a database that does not answer is poor on its own with other trouble', () => {
  const r = healthScore({ ...ok, databaseOk: false, alertsCritical: 2 });
  assert.equal(r.score, 30);
  assert.equal(r.level, 'poor');
});
check('each signal is capped', () => {
  assert.equal(healthScore({ ...ok, alertsCritical: 50 }).score, 70);
  assert.equal(healthScore({ ...ok, alertsHigh: 50 }).score, 85);
  assert.equal(healthScore({ ...ok, incidentsOpen: 50 }).score, 80);
  assert.equal(healthScore({ ...ok, siemFailing: 50 }).score, 90);
});
check('worst case stays inside 0 to 100', () => {
  const r = healthScore({
    databaseOk: false,
    alertsCritical: 99,
    alertsHigh: 99,
    incidentsOpen: 99,
    siemFailing: 99,
  });
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.equal(r.score, 0);
  assert.equal(r.reasons.length, 5);
});
check('levels', () => {
  assert.equal(healthScore({ ...ok, siemFailing: 2 }).level, 'good');
  assert.equal(healthScore({ ...ok, alertsCritical: 2 }).level, 'watch');
  assert.equal(healthScore({ ...ok, alertsCritical: 3, incidentsOpen: 2 }).level, 'poor');
});

process.stdout.write(`step16-admin-health: ${checks} checks passed\n`);
