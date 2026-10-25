// path: scripts/verify/step16-cron-tick.ts
// Checks of the Netlify scheduler: the cron line matcher and the job list copied from cron/jobs.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-cron-tick.ts
import assert from 'node:assert/strict';
import { CRON_JOBS } from '../../netlify/cron-jobs.generated.mjs';
import { dueJobs, fieldMatches, scheduleMatches } from '../../netlify/functions/cron-tick.mjs';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
const at = (iso: string): Date => new Date(`${iso}Z`);

check('fields: star, number, list, range, step', () => {
  assert.equal(fieldMatches('*', 7, 0, 59), true);
  assert.equal(fieldMatches('7', 7, 0, 59), true);
  assert.equal(fieldMatches('7', 8, 0, 59), false);
  assert.equal(fieldMatches('1,15,30', 15, 0, 59), true);
  assert.equal(fieldMatches('10-20', 20, 0, 59), true);
  assert.equal(fieldMatches('10-20', 21, 0, 59), false);
  assert.equal(fieldMatches('*/10', 40, 0, 59), true);
  assert.equal(fieldMatches('*/10', 41, 0, 59), false);
  assert.equal(fieldMatches('10-30/5', 25, 0, 59), true);
  assert.equal(fieldMatches('10-30/5', 26, 0, 59), false);
  assert.equal(fieldMatches('99', 5, 0, 59), false);
  assert.equal(fieldMatches('x', 5, 0, 59), false);
});
check('lines match the minute they name (UTC)', () => {
  assert.equal(scheduleMatches('* * * * *', at('2026-10-25T08:33:00')), true);
  assert.equal(scheduleMatches('*/5 * * * *', at('2026-10-25T08:35:00')), true);
  assert.equal(scheduleMatches('*/5 * * * *', at('2026-10-25T08:36:00')), false);
  assert.equal(scheduleMatches('20 6 * * *', at('2026-10-25T06:20:00')), true);
  assert.equal(scheduleMatches('20 6 * * *', at('2026-10-25T07:20:00')), false);
  assert.equal(scheduleMatches('11 */6 * * *', at('2026-10-25T12:11:00')), true);
  assert.equal(scheduleMatches('11 */6 * * *', at('2026-10-25T13:11:00')), false);
  assert.equal(scheduleMatches('0 0 * * 7', at('2026-10-25T00:00:00')), true);
  assert.equal(scheduleMatches('bad line', at('2026-10-25T00:00:00')), false);
});
check('the list is current and has one entry for every job file', () => {
  const run = spawnSync('node', ['scripts/build-cron-manifest.mjs', '--check'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const files = readdirSync('cron/jobs').filter((f) => /^s\d{2}-[a-z0-9-]+\.ts$/.test(f));
  assert.equal(CRON_JOBS.length, files.length);
});
check('a job runs at least once a day and the every-minute jobs run every minute', () => {
  const everyMinute = CRON_JOBS.filter((j) => j.schedule === '* * * * *').map((j) => j.name);
  assert.ok(everyMinute.includes('email-queue'));
  assert.ok(dueJobs(at('2026-10-25T08:33:00')).includes('email-queue'));
  const seen = new Set<string>();
  for (let m = 0; m < 24 * 60; m += 1) {
    const t = new Date(Date.UTC(2026, 9, 25, 0, 0, 0) + m * 60_000);
    for (const n of dueJobs(t)) seen.add(n);
  }
  for (const j of CRON_JOBS) assert.ok(seen.has(j.name), `${j.name} never runs in a day`);
  assert.ok(seen.has('processor-health'));
});

process.stdout.write(`step16-cron-tick: ${checks} checks passed\n`);
