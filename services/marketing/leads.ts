// path: services/marketing/leads.ts
// Lead capture from the public site (newsletter box and the free tools) and the leads list of the team.
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { hashIp } from '@/services/audit/request-meta';
import type { Actor } from '@/types/contracts';
import type { LeadCapture } from './schemas';

const log = createLogger({ component: 'leads' });
const DAY = 86_400_000;
export const LEAD_THANKS = 'Thank you. Your details were saved.';

export async function captureLead(input: LeadCapture, ip: string): Promise<void> {
  if (input.website.trim() !== '') return;
  const human = await getService('security').verifyTurnstile(input.turnstileToken, ip);
  if (!human) throw new ValidationError('The security check failed. Please try again.');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('leads')
    .select('id, status, marketing_ok')
    .eq('email', input.email)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  let id: string;
  let welcome = false;
  if (existing.data) {
    id = String(existing.data.id);
    // A person who unsubscribed stays unsubscribed; others can add their agreement.
    if (
      input.marketingOk &&
      existing.data.status !== 'unsubscribed' &&
      existing.data.marketing_ok !== true
    ) {
      const r = await admin.from('leads').update({ marketing_ok: true }).eq('id', id);
      if (r.error) throw new InternalError(r.error);
      welcome = true;
    }
  } else {
    const r = await admin
      .from('leads')
      .insert({
        email: input.email,
        full_name: input.name,
        source: input.source,
        marketing_ok: input.marketingOk,
        ip_hash: await hashIp(ip).catch(() => null),
      })
      .select('id')
      .single();
    if (r.error) throw new InternalError(r.error);
    id = String(r.data.id);
    welcome = input.marketingOk;
  }
  if (input.marketingOk) {
    await getService('consent')
      .record({
        subject: `lead:${id}`,
        purpose: 'email_marketing',
        version: '2026-01',
        text: 'I agree to receive e-mails from KD SOLUTION IT about its products. I can unsubscribe at any time.',
      })
      .catch((error: unknown) =>
        log.warn('lead consent not stored', {
          error: error instanceof Error ? error.message : 'failed',
        }),
      );
  }
  const email = tryGetService('email');
  if (!welcome || !email) return;
  // A short series: now, after three days, after seven days. The e-mail service skips suppressed addresses.
  const steps: [string, number][] = [
    ['marketing.welcome', 0],
    ['marketing.drip-2', 3],
    ['marketing.drip-3', 7],
  ];
  try {
    for (const [template, days] of steps)
      await email.enqueue({
        template,
        to: input.email,
        data: { name: input.name },
        idempotencyKey: `${template}:${id}`,
        sendAt: new Date(Date.now() + days * DAY),
      });
  } catch (error) {
    log.warn('welcome series not queued', {
      error: error instanceof Error ? error.message : 'failed',
    });
  }
}

export interface LeadRow {
  id: string;
  email: string;
  name: string;
  source: string;
  status: string;
  marketingOk: boolean;
  note: string;
  createdAt: string;
}

export async function listLeads(): Promise<LeadRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('leads')
    .select('id, email, full_name, source, status, marketing_ok, note, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.full_name),
    source: String(r.source),
    status: String(r.status),
    marketingOk: r.marketing_ok === true,
    note: String(r.note),
    createdAt: String(r.created_at),
  }));
}

export async function updateLead(
  actor: Actor,
  input: { id: string; status: string; note: string },
): Promise<void> {
  const patch: Record<string, unknown> = { status: input.status, note: input.note };
  if (input.status === 'unsubscribed') patch.marketing_ok = false;
  const { data, error } = await getAdminSupabase()
    .from('leads')
    .update(patch)
    .eq('id', input.id)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'leads.updated',
    resourceType: 'lead',
    resourceId: input.id,
    companyId: null,
    metadata: { status: input.status, by: actor.userId },
  });
}
