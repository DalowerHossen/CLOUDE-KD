// path: services/marketing/admin.ts
// Marketing management: testimonials, e-mail campaigns and A/B experiments.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { type z } from 'zod';
import { getService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import {
  type experimentActionSchema,
  type ExperimentInput,
  type campaignActionSchema,
  type campaignSchema,
  type testimonialSchema,
} from './schemas';
import { significance } from '@/lib/marketing/significance';

const log = createLogger({ component: 'marketing' });

async function audit(
  action: string,
  id: string | null,
  by: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'marketing',
    resourceId: id,
    companyId: null,
    metadata: { ...metadata, by },
  });
}

function refreshSite(): void {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // Outside a request there is nothing to refresh; pages refresh by time as well.
  }
}

// ---- testimonials ----
export interface TestimonialRow {
  id: string;
  quote: string;
  personName: string;
  personRole: string;
  organization: string;
  approved: boolean;
  sortOrder: number;
}

export async function listTestimonials(): Promise<TestimonialRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('testimonials')
    .select('id, quote, person_name, person_role, organization, approved, sort_order')
    .is('deleted_at', null)
    .order('sort_order')
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    quote: String(r.quote),
    personName: String(r.person_name),
    personRole: String(r.person_role),
    organization: String(r.organization),
    approved: r.approved === true,
    sortOrder: Number(r.sort_order),
  }));
}

export async function saveTestimonial(
  actor: Actor,
  input: z.infer<typeof testimonialSchema>,
): Promise<void> {
  const row = {
    quote: input.quote,
    person_name: input.personName,
    person_role: input.personRole,
    organization: input.organization,
    approved: input.approved,
    sort_order: input.sortOrder,
  };
  const admin = getAdminSupabase();
  const r = input.id
    ? await admin.from('testimonials').update(row).eq('id', input.id).is('deleted_at', null)
    : await admin.from('testimonials').insert(row);
  if (r.error) throw new InternalError(r.error);
  await audit('marketing.testimonial_saved', input.id, actor.userId, { approved: input.approved });
  refreshSite();
}

export async function deleteTestimonial(actor: Actor, id: string): Promise<void> {
  const r = await getAdminSupabase()
    .from('testimonials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (r.error) throw new InternalError(r.error);
  await audit('marketing.testimonial_deleted', id, actor.userId);
  refreshSite();
}

/** Approved testimonials in display order, for the testimonials block of public pages. */
export async function approvedTestimonials(): Promise<
  { quote: string; name: string; role: string; company: string }[]
> {
  const { data, error } = await getAdminSupabase()
    .from('testimonials')
    .select('quote, person_name, person_role, organization')
    .eq('approved', true)
    .is('deleted_at', null)
    .order('sort_order')
    .limit(12);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    quote: String(r.quote),
    name: String(r.person_name),
    role: String(r.person_role),
    company: String(r.organization),
  }));
}

// ---- campaigns ----
export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  status: string;
  recipientCount: number;
  sentAt: string | null;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('campaigns')
    .select('id, name, subject, body_text, status, recipient_count, sent_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    subject: String(r.subject),
    bodyText: String(r.body_text),
    status: String(r.status),
    recipientCount: Number(r.recipient_count),
    sentAt: r.sent_at ? String(r.sent_at) : null,
  }));
}

export async function saveCampaign(
  actor: Actor,
  input: z.infer<typeof campaignSchema>,
): Promise<void> {
  const admin = getAdminSupabase();
  const row = { name: input.name, subject: input.subject, body_text: input.bodyText };
  if (input.id) {
    const cur = await admin
      .from('campaigns')
      .select('status')
      .eq('id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cur.error) throw new InternalError(cur.error);
    if (!cur.data) throw new NotFoundError();
    if (cur.data.status !== 'draft')
      throw new ValidationError('A campaign that was sent cannot be edited.');
  }
  const r = input.id
    ? await admin.from('campaigns').update(row).eq('id', input.id)
    : await admin.from('campaigns').insert(row);
  if (r.error) throw new InternalError(r.error);
  await audit('marketing.campaign_saved', input.id, actor.userId);
}

export async function runCampaignAction(
  actor: Actor,
  input: z.infer<typeof campaignActionSchema>,
): Promise<unknown> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('campaigns')
    .select('id, subject, body_text, status')
    .eq('id', input.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  const email = getService('email');
  const campaign = found.data;
  const data = (name: string): Record<string, unknown> => ({
    subject: String(campaign.subject),
    bodyText: String(campaign.body_text),
    name,
  });
  switch (input.action) {
    case 'test': {
      await email.send({
        template: 'marketing.campaign',
        to: input.to,
        data: data(''),
        idempotencyKey: `campaign-test:${input.id}:${Date.now()}`,
      });
      await audit('marketing.campaign_tested', input.id, actor.userId);
      return { sent: 1 };
    }
    case 'delete': {
      if (found.data.status === 'sending') throw new ValidationError('The campaign is being sent.');
      const r = await admin
        .from('campaigns')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (r.error) throw new InternalError(r.error);
      await audit('marketing.campaign_deleted', input.id, actor.userId);
      return { done: true };
    }
    case 'send': {
      if (found.data.status !== 'draft')
        throw new ValidationError('This campaign was already sent.');
      // Claim the campaign first so a double click cannot send twice.
      const claim = await admin
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', input.id)
        .eq('status', 'draft')
        .select('id');
      if (claim.error) throw new InternalError(claim.error);
      if (!claim.data || claim.data.length === 0)
        throw new ValidationError('This campaign is already being sent.');
      const leads = await admin
        .from('leads')
        .select('id, email, full_name')
        .eq('marketing_ok', true)
        .neq('status', 'unsubscribed')
        .is('deleted_at', null)
        .limit(5000);
      if (leads.error) throw new InternalError(leads.error);
      let sent = 0;
      for (const lead of leads.data ?? []) {
        try {
          await email.enqueue({
            template: 'marketing.campaign',
            to: String(lead.email),
            data: data(String(lead.full_name)),
            idempotencyKey: `campaign:${input.id}:${String(lead.id)}`,
          });
          sent += 1;
        } catch (error) {
          log.warn('campaign message not queued', {
            error: error instanceof Error ? error.message : 'failed',
          });
        }
      }
      const done = await admin
        .from('campaigns')
        .update({ status: 'sent', recipient_count: sent, sent_at: new Date().toISOString() })
        .eq('id', input.id);
      if (done.error) throw new InternalError(done.error);
      await audit('marketing.campaign_sent', input.id, actor.userId, { recipients: sent });
      return { recipients: sent };
    }
  }
}

// ---- experiments ----
export interface ExperimentRow {
  id: string;
  key: string;
  name: string;
  goalEvent: string;
  status: string;
  winner: string | null;
  variants: ExperimentInput['variants'];
  results: {
    variant: string;
    exposures: number;
    conversions: number;
    rate: number;
    significant: boolean | null;
    pValue: number | null;
  }[];
}

export async function listExperiments(): Promise<ExperimentRow[]> {
  const admin = getAdminSupabase();
  const [ex, stats] = await Promise.all([
    admin
      .from('ab_experiments')
      .select('id, key, name, goal_event, status, winner, variants')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('ab_stats')
      .select('experiment_key, variant, exposures, conversions')
      .is('deleted_at', null)
      .limit(20000),
  ]);
  if (ex.error) throw new InternalError(ex.error);
  if (stats.error) throw new InternalError(stats.error);
  return (ex.data ?? []).map((e) => {
    const variants = e.variants as ExperimentInput['variants'];
    const totals = variants.map((v) => {
      const rows = (stats.data ?? []).filter(
        (s) => s.experiment_key === e.key && s.variant === v.key,
      );
      return {
        variant: v.key,
        exposures: rows.reduce((n, r) => n + Number(r.exposures), 0),
        conversions: rows.reduce((n, r) => n + Number(r.conversions), 0),
      };
    });
    const control = totals[0];
    return {
      id: String(e.id),
      key: String(e.key),
      name: String(e.name),
      goalEvent: String(e.goal_event),
      status: String(e.status),
      winner: e.winner ? String(e.winner) : null,
      variants,
      results: totals.map((t, i) => {
        const test = i === 0 || !control ? null : significance(control, t);
        return {
          ...t,
          rate: t.exposures ? t.conversions / t.exposures : 0,
          significant: test ? test.significant : null,
          pValue: test ? test.pValue : null,
        };
      }),
    };
  });
}

export async function saveExperiment(actor: Actor, input: ExperimentInput): Promise<void> {
  const admin = getAdminSupabase();
  const row = {
    key: input.key,
    name: input.name,
    goal_event: input.goalEvent,
    variants: input.variants,
  };
  if (input.id) {
    const cur = await admin
      .from('ab_experiments')
      .select('status')
      .eq('id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cur.error) throw new InternalError(cur.error);
    if (!cur.data) throw new NotFoundError();
    if (cur.data.status !== 'draft')
      throw new ValidationError('Only a draft experiment can be edited.');
  }
  const r = input.id
    ? await admin.from('ab_experiments').update(row).eq('id', input.id)
    : await admin.from('ab_experiments').insert(row);
  if (r.error) {
    if (r.error.code === '23505') throw new DuplicateError('An experiment with this key exists.');
    throw new InternalError(r.error);
  }
  await audit('marketing.experiment_saved', input.id, actor.userId, { key: input.key });
}

export async function runExperimentAction(
  actor: Actor,
  input: z.infer<typeof experimentActionSchema>,
): Promise<void> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('ab_experiments')
    .select('id, key, status, variants')
    .eq('id', input.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  let patch: Record<string, unknown>;
  switch (input.action) {
    case 'start':
      if (found.data.status !== 'draft') throw new ValidationError('Only a draft can be started.');
      patch = { status: 'running' };
      break;
    case 'stop':
      patch = { status: 'stopped' };
      break;
    case 'winner': {
      const keys = (found.data.variants as { key: string }[]).map((v) => v.key);
      if (!keys.includes(input.variant)) throw new ValidationError('That variant does not exist.');
      patch = { status: 'stopped', winner: input.variant };
      break;
    }
    case 'delete':
      patch = { deleted_at: new Date().toISOString() };
      break;
  }
  const r = await admin.from('ab_experiments').update(patch).eq('id', input.id);
  if (r.error) throw new InternalError(r.error);
  await audit(`marketing.experiment_${input.action}`, input.id, actor.userId, {
    key: String(found.data.key),
  });
  refreshSite();
}

/** What a visitor needs to run an experiment: its variants and the goal. Only running experiments are public. */
export async function publicExperiment(
  key: string,
): Promise<{ key: string; goalEvent: string; variants: ExperimentInput['variants'] } | null> {
  const { data, error } = await getAdminSupabase()
    .from('ab_experiments')
    .select('key, goal_event, variants, status, winner')
    .eq('key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || data.status !== 'running' || data.winner) return null;
  return {
    key: String(data.key),
    goalEvent: String(data.goal_event),
    variants: data.variants as ExperimentInput['variants'],
  };
}

/** The decided variant of an experiment (its text), for the server render of the block. */
export async function decidedVariant(
  key: string,
): Promise<ExperimentInput['variants'][number] | null> {
  const { data, error } = await getAdminSupabase()
    .from('ab_experiments')
    .select('variants, winner')
    .eq('key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data?.winner) return null;
  return (data.variants as ExperimentInput['variants']).find((v) => v.key === data.winner) ?? null;
}

export async function countAb(
  key: string,
  variant: string,
  kind: 'exposure' | 'conversion',
): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_ab_count', {
    p_key: key,
    p_variant: variant,
    p_kind: kind,
  });
  if (error) throw new InternalError(error);
  return data === true;
}
