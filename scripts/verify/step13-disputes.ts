// path: scripts/verify/step13-disputes.ts
// Logic checks of disputes (13.8) that need no database or network: the status machine, reason sorting and the adapter
// hook, the alert schedule, the event worker and the cron job. Run:
// SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-disputes.ts
import assert from 'node:assert/strict';
import { DISPUTE_ALERT_HOURS, DISPUTE_RESPONSE_DAYS } from '@/config/s13-portal';
import { job } from '@/cron/jobs/s13-disputes';
import { nextAlert } from '@/services/dispute/deadlines';
import {
  categorize,
  EVIDENCE_HINTS,
  REASON_CATEGORIES,
  registerReasonMapper,
} from '@/services/dispute/reasons';
import { canMove, choices, DISPUTE_STATUSES, isClosed, isOpen } from '@/services/dispute/status';
import { eventHandler } from '@/workers/s13/dispute-intake.event';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const due = (hours: number): string => new Date(NOW + hours * HOUR).toISOString();
const none = { h72: false, h24: false, overdue: false };

async function main(): Promise<void> {
  await check('status machine: forward only, four final states, new cannot be re-opened', () => {
    assert.ok(canMove('new', 'gathering'));
    assert.ok(canMove('gathering', 'submitted'));
    assert.ok(canMove('submitted', 'won'));
    assert.ok(!canMove('submitted', 'gathering'), 'no step back');
    assert.ok(!canMove('submitted', 'accepted'), 'evidence already sent');
    assert.ok(!canMove('gathering', 'new'));
    for (const final of ['won', 'lost', 'accepted', 'withdrawn'] as const) {
      assert.ok(isClosed(final));
      assert.deepEqual(choices(final), []);
      for (const to of DISPUTE_STATUSES) assert.ok(!canMove(final, to), `${final} -> ${to}`);
    }
    assert.ok(isOpen('new') && isOpen('gathering') && !isOpen('submitted'));
  });

  await check(
    'reason codes are sorted by keyword, and an adapter can register its own mapper',
    () => {
      assert.equal(categorize('x', 'fraudulent'), 'fraud');
      assert.equal(categorize('x', 'Unrecognized charge'), 'fraud');
      assert.equal(categorize('x', 'product_not_received'), 'product_not_received');
      assert.equal(categorize('x', 'product_unacceptable'), 'not_as_described');
      assert.equal(categorize('x', 'duplicate'), 'duplicate');
      assert.equal(categorize('x', 'subscription_canceled'), 'subscription_canceled');
      assert.equal(categorize('x', 'credit_not_processed'), 'credit_not_processed');
      assert.equal(categorize('x', 'something else'), 'general');
      assert.equal(categorize('x', null), 'general');
      assert.equal(categorize('x', '   '), 'general');
      registerReasonMapper('acme-pay', (code) => (code === '4837' ? 'fraud' : null));
      assert.equal(categorize('acme-pay', '4837'), 'fraud');
      assert.equal(categorize('acme-pay', 'duplicate'), 'duplicate', 'falls back to keywords');
      assert.equal(categorize('other-pay', '4837'), 'general', 'a mapper belongs to one processor');
      for (const c of REASON_CATEGORIES) assert.ok(EVIDENCE_HINTS[c].length > 20, c);
    },
  );

  await check('alerts: 72 hours, 24 hours, overdue; each once; nothing too early', () => {
    assert.deepEqual([...DISPUTE_ALERT_HOURS], [72, 24]);
    assert.equal(nextAlert(due(100), none, NOW), null, 'too early');
    assert.equal(nextAlert(due(70), none, NOW), '72h');
    assert.equal(nextAlert(due(70), { ...none, h72: true }, NOW), null, 'sent already');
    assert.equal(
      nextAlert(due(20), none, NOW),
      '24h',
      'skips straight to 24h when late to the party',
    );
    assert.equal(nextAlert(due(20), { ...none, h72: true }, NOW), '24h');
    assert.equal(nextAlert(due(20), { h72: false, h24: true, overdue: false }, NOW), null);
    assert.equal(nextAlert(due(-1), none, NOW), 'overdue');
    assert.equal(nextAlert(due(-1), { h72: true, h24: true, overdue: true }, NOW), null);
    assert.equal(nextAlert(due(-500), { h72: true, h24: true, overdue: false }, NOW), 'overdue');
  });

  await check('the default answer window is a sensible number of days', () => {
    assert.ok(DISPUTE_RESPONSE_DAYS >= 3 && DISPUTE_RESPONSE_DAYS <= 14);
  });

  await check('the worker listens to the three dispute events and the job runs hourly', () => {
    assert.equal(eventHandler.id, 'dispute.intake');
    assert.deepEqual([...eventHandler.events].sort(), [
      'dispute.lost',
      'dispute.opened',
      'dispute.won',
    ]);
    assert.equal(job.name, 'dispute-deadlines');
    assert.match(job.schedule, /^\d+ \* \* \* \*$/);
    assert.equal(typeof job.handler, 'function');
  });

  process.stdout.write(`step13-disputes: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
