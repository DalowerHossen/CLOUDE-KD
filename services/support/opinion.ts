// path: services/support/opinion.ts
// Feedback and NPS: a short score question shown now and then to people of a company, free feedback from any page,
// and the platform summary for the super admin and the CEO.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import {
  NPS_DISMISS_DAYS,
  npsPromptDue,
  summarizeNps,
  type FeedbackAction,
  type NpsSummary,
} from '@/lib/helpdesk/opinion';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export async function promptDue(actor: Actor): Promise<boolean> {
  const companyId = actor.companyId;
  if (!companyId) return false;
  const admin = getAdminSupabase();
  const [company, state] = await Promise.all([
    admin.from('companies').select('created_at').eq('id', companyId).maybeSingle(),
    admin
      .from('feedback_prompts')
      .select('last_answered_at, dismissed_until')
      .eq('user_id', actor.userId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (company.error) throw new InternalError(company.error);
  if (state.error) throw new InternalError(state.error);
  if (!company.data) return false;
  return npsPromptDue({
    companyCreatedAt: new Date(String(company.data.created_at)),
    lastAnsweredAt: state.data?.last_answered_at
      ? new Date(String(state.data.last_answered_at))
      : null,
    dismissedUntil: state.data?.dismissed_until
      ? new Date(String(state.data.dismissed_until))
      : null,
    now: new Date(),
  });
}

export async function submitFeedback(actor: Actor, input: FeedbackAction): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  if (input.action === 'dismiss') {
    const r = await admin.rpc('kd_feedback_dismissed', {
      p_company: companyId,
      p_user: actor.userId,
      p_days: NPS_DISMISS_DAYS,
    });
    if (r.error) throw new InternalError(r.error);
    return;
  }
  const row =
    input.action === 'nps'
      ? { kind: 'nps', score: input.score, comment: input.comment }
      : { kind: 'feedback', category: input.category, comment: input.comment, page: input.page };
  const w = await admin
    .from('feedback_entries')
    .insert({ company_id: companyId, user_id: actor.userId, ...row })
    .select('id')
    .single();
  if (w.error) throw new InternalError(w.error);
  if (input.action === 'nps') {
    const r = await admin.rpc('kd_feedback_answered', {
      p_company: companyId,
      p_user: actor.userId,
    });
    if (r.error) throw new InternalError(r.error);
  }
  await getService('audit').record({
    action: input.action === 'nps' ? 'feedback.nps_answered' : 'feedback.sent',
    resourceType: 'feedback',
    resourceId: String(w.data.id),
    companyId,
    metadata: { by: actor.userId },
  });
}

export interface FeedbackSummary {
  nps: NpsSummary;
  recent: {
    at: string;
    kind: 'nps' | 'feedback';
    score: number | null;
    category: string;
    comment: string;
    page: string;
    companyName: string;
  }[];
}

/** Answers of the last 90 days. */
export async function feedbackSummary(): Promise<FeedbackSummary> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('feedback_entries')
    .select('company_id, kind, score, category, comment, page, created_at')
    .gte('created_at', since)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => String(r.company_id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const c = await admin.from('companies').select('id, name').in('id', ids);
    for (const x of c.data ?? []) names.set(String(x.id), String(x.name));
  }
  return {
    nps: summarizeNps(rows.filter((r) => r.kind === 'nps').map((r) => Number(r.score))),
    recent: rows
      .filter((r) => String(r.comment) !== '')
      .slice(0, 50)
      .map((r) => ({
        at: String(r.created_at),
        kind: String(r.kind) as 'nps' | 'feedback',
        score: r.score === null ? null : Number(r.score),
        category: String(r.category),
        comment: String(r.comment),
        page: String(r.page),
        companyName: names.get(String(r.company_id)) ?? '',
      })),
  };
}
