// path: services/dispute/deadlines.ts
// Alerts for answers that are due. The owner hears 72 hours and 24 hours before the date, and once when it is overdue.
// Each alert is sent once per case (the time is stored on the case), and a new date starts them again.
import 'server-only';
import { DISPUTE_ALERT_HOURS } from '@/config/s13-portal';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { addDisputeEvent } from './disputes';

const HOUR = 3_600_000;

export interface AlertPlan {
  stage: '72h' | '24h' | 'overdue' | null;
}

/** Which alert is due now for a case with this due date and these already-sent alerts. Pure. */
export function nextAlert(
  dueAt: string,
  sent: { h72: boolean; h24: boolean; overdue: boolean },
  now: number = Date.now(),
): AlertPlan['stage'] {
  const left = Date.parse(dueAt) - now;
  if (left <= 0) return sent.overdue ? null : 'overdue';
  if (left <= DISPUTE_ALERT_HOURS[1] * HOUR) return sent.h24 ? null : '24h';
  if (left <= DISPUTE_ALERT_HOURS[0] * HOUR) return sent.h72 || sent.h24 ? null : '72h';
  return null;
}

const COLUMN = {
  '72h': 'alerted_72h_at',
  '24h': 'alerted_24h_at',
  overdue: 'alerted_overdue_at',
} as const;
const TEXT = {
  '72h': 'The answer to a dispute is due in less than 72 hours.',
  '24h': 'The answer to a dispute is due in less than 24 hours.',
  overdue: 'The answer to a dispute is overdue. Send your evidence now or accept the loss.',
} as const;

/** Job (hourly): sends the alerts that are due. Returns how many were sent. */
export async function runDisputeDeadlines(now: Date = new Date()): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('disputes')
    .select('id, company_id, due_at, alerted_72h_at, alerted_24h_at, alerted_overdue_at')
    .in('status', ['new', 'gathering'])
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  let sent = 0;
  for (const row of data ?? []) {
    const stage = nextAlert(
      String(row.due_at),
      {
        h72: row.alerted_72h_at !== null,
        h24: row.alerted_24h_at !== null,
        overdue: row.alerted_overdue_at !== null,
      },
      now.getTime(),
    );
    if (!stage) continue;
    const marked = await admin
      .from('disputes')
      .update({ [COLUMN[stage]]: now.toISOString() })
      .eq('id', row.id)
      .is(COLUMN[stage], null)
      .select('id');
    if (!marked.data || marked.data.length === 0) continue;
    const companyId = String(row.company_id);
    await addDisputeEvent(companyId, String(row.id), 'alert', stage);
    await getService('notification')
      .notify({
        companyId,
        type: 'dispute.deadline',
        title: stage === 'overdue' ? 'A dispute answer is overdue' : 'A dispute answer is due soon',
        body: TEXT[stage],
        href: `/disputes/${String(row.id)}`,
      })
      .catch(() => undefined);
    sent += 1;
  }
  return sent;
}
