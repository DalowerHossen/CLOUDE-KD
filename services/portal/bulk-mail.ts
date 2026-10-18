// path: services/portal/bulk-mail.ts
// Bulk reminders for open estimates, started by the owner. Safeguards: the owner first sees who would get a message, must
// confirm the exact number (a list that changed in between is refused), at most 100 go in one run, nobody who asked for no
// contact or no reminders is written to, nobody is reminded twice within a week, every message has its own result, and
// one failure never stops the others. A run can be repeated: messages already sent are skipped, so "retry the failed" is
// just running it again.
import 'server-only';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Actor } from '@/types/contracts';
import {
  candidatesForReminder,
  remindEstimate,
  reminderBlock,
  type EstimateMailResult,
} from './notices';
import { clientContact } from './recipients';

export const BULK_MAX = 100;

export interface BulkPreviewItem {
  estimateId: string;
  number: string;
  clientName: string;
  validUntil: string;
}

export async function previewEstimateReminders(companyId: string): Promise<BulkPreviewItem[]> {
  const candidates = await candidatesForReminder(companyId, BULK_MAX);
  const items: BulkPreviewItem[] = [];
  for (const e of candidates) {
    if (await reminderBlock(companyId, e)) continue;
    const contact = await clientContact(companyId, e.clientId);
    items.push({
      estimateId: e.id,
      number: e.number,
      clientName: contact?.name ?? '',
      validUntil: e.validUntil,
    });
  }
  return items;
}

export interface BulkRunResult {
  results: EstimateMailResult[];
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendEstimateReminders(
  actor: Actor,
  expectedCount: number,
): Promise<BulkRunResult> {
  if (!actor.companyId) throw new NotFoundError();
  const companyId = actor.companyId;
  const items = await previewEstimateReminders(companyId);
  if (items.length !== expectedCount)
    throw new ValidationError(
      `The list changed: ${items.length} estimate(s) can be reminded now, not ${expectedCount}. Check the list and confirm again.`,
    );
  if (items.length === 0) throw new ValidationError('There is nothing to send.');
  const candidates = await candidatesForReminder(companyId, BULK_MAX);
  const ids = new Set(items.map((i) => i.estimateId));
  const results: EstimateMailResult[] = [];
  for (const e of candidates.filter((c) => ids.has(c.id)))
    results.push(await remindEstimate(companyId, e));
  return {
    results,
    sent: results.filter((r) => r.state === 'sent').length,
    skipped: results.filter((r) => r.state === 'skipped').length,
    failed: results.filter((r) => r.state === 'failed').length,
  };
}
