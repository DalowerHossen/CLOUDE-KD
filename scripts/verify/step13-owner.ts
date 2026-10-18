// path: scripts/verify/step13-owner.ts
// Logic checks of the owner workflows (13.7) that need no database or network: the link-request decision shape, the
// link page for every document type, the bulk safeguards, the contract approval rule and permissions, the event handler,
// and the cron schedules. Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-owner.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { approvalRules } from '@/config/approval/s13-portal';
import { permissions } from '@/config/permissions/s13-portal';
import { job as approvalsJob } from '@/cron/jobs/s13-approvals';
import { job as noticesJob } from '@/cron/jobs/s13-notices';
import { BULK_MAX } from '@/services/portal/bulk-mail';
import { linkSegment } from '@/services/portal/link-requests';
import {
  ESTIMATE_EXPIRED_LOOKBACK_DAYS,
  ESTIMATE_REMIND_PAUSE_DAYS,
  ESTIMATE_REMIND_WINDOW_DAYS,
  RECEIPT_LINK_DAYS,
} from '@/services/portal/notices';
import { PORTAL_ROUTES } from '@/services/portal/access';
import { bulkConfirmBody, decideRequestBody } from '@/services/portal/schemas';
import { eventHandler } from '@/workers/s13/client-notices.event';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const CRON = /^(\*|\*\/\d+|\d+) (\*|\d+) (\*|\d+) (\*|\d+) (\*|\d+)$/;

async function main(): Promise<void> {
  await check(
    'a denial needs a reason, an approval does not, and nothing extra is accepted',
    () => {
      assert.ok(decideRequestBody.safeParse({ decision: 'approve', reason: '' }).success);
      assert.ok(
        decideRequestBody.safeParse({ decision: 'deny', reason: 'Not the client' }).success,
      );
      assert.ok(!decideRequestBody.safeParse({ decision: 'deny', reason: 'no' }).success);
      assert.ok(!decideRequestBody.safeParse({ decision: 'deny', reason: '   ' }).success);
      assert.ok(!decideRequestBody.safeParse({ decision: 'maybe', reason: '' }).success);
      assert.ok(
        !decideRequestBody.safeParse({ decision: 'approve', reason: '', extra: 1 }).success,
      );
    },
  );

  await check(
    'every document type has its client page, and unknown types go to the expired page',
    () => {
      for (const [segment, docType] of Object.entries(PORTAL_ROUTES))
        assert.equal(linkSegment(docType), segment, docType);
      assert.equal(linkSegment('payslip'), 'expired');
      assert.equal(linkSegment('nonsense'), 'expired');
    },
  );

  await check(
    'bulk safeguards: confirmed number between 1 and the cap, no more than 100 a run',
    () => {
      assert.equal(BULK_MAX, 100);
      assert.ok(bulkConfirmBody.safeParse({ expectedCount: 1 }).success);
      assert.ok(bulkConfirmBody.safeParse({ expectedCount: 100 }).success);
      assert.ok(!bulkConfirmBody.safeParse({ expectedCount: 0 }).success);
      assert.ok(!bulkConfirmBody.safeParse({ expectedCount: 101 }).success);
      assert.ok(!bulkConfirmBody.safeParse({ expectedCount: 2.5 }).success);
      assert.ok(!bulkConfirmBody.safeParse({ expectedCount: 5, force: true }).success);
    },
  );

  await check('reminder windows are sensible', () => {
    assert.ok(ESTIMATE_REMIND_WINDOW_DAYS >= 1 && ESTIMATE_REMIND_WINDOW_DAYS <= 7);
    assert.ok(ESTIMATE_REMIND_PAUSE_DAYS >= ESTIMATE_REMIND_WINDOW_DAYS);
    assert.ok(ESTIMATE_EXPIRED_LOOKBACK_DAYS >= 1 && RECEIPT_LINK_DAYS >= 30);
  });

  await check('staff sends go through the owner: rule, permissions and roles line up', () => {
    const rule = approvalRules.find((r) => r.action === 'contract.send');
    assert.ok(rule, 'approval rule');
    assert.equal(rule.level, 'L1');
    const byAction = new Map(permissions.map((p) => [p.action, p]));
    assert.deepEqual(byAction.get('contract.send')?.defaultRoles, ['owner']);
    assert.ok(byAction.get('contract.request_send')?.defaultRoles.includes('staff'));
    assert.deepEqual(byAction.get('portal.link.decide')?.defaultRoles, ['owner']);
    assert.deepEqual(byAction.get('portal.mail.bulk')?.defaultRoles, ['owner']);
    assert.equal(
      new Set(permissions.map((p) => p.action)).size,
      permissions.length,
      'no duplicates',
    );
  });

  await check(
    'the notice worker listens to the three payment events and the cron jobs are valid',
    () => {
      assert.equal(eventHandler.id, 'portal.client-notices');
      assert.deepEqual([...eventHandler.events].sort(), [
        'invoice.paid',
        'payment.captured',
        'payment.refunded',
      ]);
      // The contract job imports the PDF engine (ESM only), so its schedule is read from the file.
      const contractsText = fs.readFileSync('cron/jobs/s13-contracts.ts', 'utf8');
      const contractsSchedule = /schedule: '([^']+)'/.exec(contractsText)?.[1] ?? '';
      const contractsName = /name: '([^']+)'/.exec(contractsText)?.[1] ?? '';
      assert.match(contractsSchedule, CRON, contractsName);
      for (const job of [approvalsJob, noticesJob]) {
        assert.match(job.schedule, CRON, job.name);
        assert.equal(typeof job.handler, 'function');
      }
      assert.equal(new Set([approvalsJob.name, noticesJob.name, contractsName]).size, 3);
    },
  );

  process.stdout.write(`step13-owner: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
