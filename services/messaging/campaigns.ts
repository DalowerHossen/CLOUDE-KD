// path: services/messaging/campaigns.ts
// Multi-channel campaigns. A campaign has an audience (a segment of clients), one variant (or up to four for an A/B test) with its
// own channel order and text, and sends through the routing engine, so consent and quiet hours apply to every message. Starting a
// campaign fixes its audience (one message per client). With an A/B test only the test group is sent first (an equal share for
// each variant); after the chosen hours the winner is picked by the stated rule (highest share of opened or read messages among
// delivered ones, with a minimum sample; ties go to the earlier variant) and the rest of the audience receives the winner.
import 'server-only';
import { AB_MAX_EXTENSION_HOURS, CAMPAIGN_MAX_AUDIENCE } from '@/config/s16-messaging';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  campaignInput,
  channelReport,
  inQuiet,
  pickWinner,
  quietEnds,
  rate,
  splitAudience,
  type Audience,
  type VariantStats,
} from '@/lib/messaging/rules';
import { inSegment, type AudienceClient, type ClientStats } from '@/lib/whatsapp/automation-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getSettings, need, record } from './db';

const log = createLogger({ service: 'messaging-campaigns' });
const LABELS = ['A', 'B', 'C', 'D'] as const;

export interface VariantView {
  id: string;
  label: string;
  channelOrder: string[];
  subject: string;
  body: string;
  whatsappTemplateId: string | null;
  whatsappValues: Record<string, string>;
}

export interface CampaignView {
  id: string;
  name: string;
  status: 'draft' | 'testing' | 'running' | 'paused' | 'finished' | 'cancelled';
  audience: Audience;
  abEnabled: boolean;
  testPercent: number;
  decideAfterHours: number;
  winnerVariantId: string | null;
  winnerReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  variants: VariantView[];
  version: number;
  createdAt: string;
}

const COLUMNS =
  'id, name, status, segment, ab_enabled, test_percent, decide_after_hours, winner_variant_id, winner_reason, started_at, finished_at, version, created_at';
const STATES = ['draft', 'testing', 'running', 'paused', 'finished', 'cancelled'] as const;

interface Row {
  id: string;
  name: string;
  status: string;
  segment: Audience;
  ab_enabled: boolean;
  test_percent: number;
  decide_after_hours: number;
  winner_variant_id: string | null;
  winner_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  version: number;
  created_at: string;
}

async function variantsOf(campaignId: string): Promise<VariantView[]> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_variants')
    .select('id, label, channel_order, subject, body, whatsapp_template_id, whatsapp_values')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('label', { ascending: true });
  if (error) throw new InternalError(error);
  return (data ?? []).map((v) => ({
    id: String(v.id),
    label: String(v.label),
    channelOrder: (v.channel_order as string[]).map(String),
    subject: String(v.subject),
    body: String(v.body),
    whatsappTemplateId: v.whatsapp_template_id === null ? null : String(v.whatsapp_template_id),
    whatsappValues: (v.whatsapp_values ?? {}) as Record<string, string>,
  }));
}

async function toView(r: Row): Promise<CampaignView> {
  return {
    id: r.id,
    name: r.name,
    status: STATES.find((s) => s === r.status) ?? 'draft',
    audience: r.segment,
    abEnabled: r.ab_enabled,
    testPercent: r.test_percent,
    decideAfterHours: r.decide_after_hours,
    winnerVariantId: r.winner_variant_id,
    winnerReason: r.winner_reason,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    variants: await variantsOf(r.id),
    version: r.version,
    createdAt: r.created_at,
  };
}

export async function listCampaigns(companyId: string): Promise<CampaignView[]> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_campaigns')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return Promise.all(((data ?? []) as unknown as Row[]).map(toView));
}

export async function getCampaign(companyId: string, id: string): Promise<CampaignView> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_campaigns')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

export async function createCampaign(actor: Actor, input: unknown): Promise<CampaignView> {
  const companyId = need(actor);
  const parsed = campaignInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The campaign is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const templates = d.variants
    .map((v) => v.whatsappTemplateId)
    .filter((t): t is string => t !== null);
  if (templates.length > 0) {
    const found = await admin
      .from('whatsapp_templates')
      .select('id')
      .eq('company_id', companyId)
      .in('id', templates)
      .is('deleted_at', null);
    if (found.error) throw new InternalError(found.error);
    if ((found.data ?? []).length !== new Set(templates).size)
      throw new ValidationError('A WhatsApp template was not found.');
  }
  const made = await admin
    .from('messaging_campaigns')
    .insert({
      company_id: companyId,
      name: d.name,
      segment: d.audience,
      ab_enabled: d.abEnabled,
      test_percent: d.testPercent,
      decide_after_hours: d.decideAfterHours,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (made.error) mapIntegrationError(made.error);
  const id = String(made.data?.id);
  const ins = await admin.from('messaging_variants').insert(
    d.variants.map((v, i) => ({
      company_id: companyId,
      campaign_id: id,
      label: LABELS[i] ?? 'A',
      channel_order: v.channelOrder,
      subject: v.subject,
      body: v.body,
      whatsapp_template_id: v.whatsappTemplateId,
      whatsapp_values: v.whatsappValues,
    })),
  );
  if (ins.error) {
    await admin
      .from('messaging_campaigns')
      .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
      .eq('id', id);
    mapIntegrationError(ins.error);
  }
  await record(companyId, 'messaging.campaign_created', 'messaging_campaign', id, {
    variants: d.variants.length,
    ab: d.abEnabled,
  });
  return getCampaign(companyId, id);
}

/* ---------- audience ---------- */

interface Candidate {
  id: string;
}

async function loadAudience(companyId: string, seg: Audience): Promise<Candidate[]> {
  const admin = getAdminSupabase();
  const clients = await admin
    .from('clients')
    .select('id, name, tags, do_not_contact')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .eq('do_not_contact', false)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(CAMPAIGN_MAX_AUDIENCE * 2);
  if (clients.error) throw new InternalError(clients.error);
  const invoices = await admin
    .from('invoices')
    .select('client_id, status, amount_due, issue_date')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(100_000);
  if (invoices.error) throw new InternalError(invoices.error);
  const stats = new Map<string, { balance: Money; open: number; last: string | null }>();
  for (const i of invoices.data ?? []) {
    const key = String(i.client_id);
    const s = stats.get(key) ?? { balance: Money.zero(), open: 0, last: null };
    if (!['draft', 'paid', 'void', 'pending_approval'].includes(String(i.status))) {
      s.balance = s.balance.add(Money.parse(String(i.amount_due ?? 0)));
      s.open += 1;
    }
    const issued = String(i.issue_date);
    if (s.last === null || issued > s.last) s.last = issued;
    stats.set(key, s);
  }
  const out: Candidate[] = [];
  for (const c of clients.data ?? []) {
    const s = stats.get(String(c.id));
    const client: AudienceClient = {
      id: String(c.id),
      name: String(c.name),
      contactName: '',
      phone: '',
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      doNotContact: false,
    };
    const st: ClientStats = {
      balance: (s?.balance ?? Money.zero()).toDbString(),
      openInvoices: s?.open ?? 0,
      lastInvoiceDate: s?.last ?? null,
    };
    const segment = { ...seg, optedInOnly: false };
    if (inSegment(client, st, segment)) out.push({ id: client.id });
    if (out.length >= CAMPAIGN_MAX_AUDIENCE) break;
  }
  return out;
}

/** How many clients a segment reaches (clients who asked not to be contacted are never counted). */
export async function previewAudience(
  companyId: string,
  seg: Audience,
): Promise<{ total: number }> {
  return { total: (await loadAudience(companyId, seg)).length };
}

/* ---------- start, cancel ---------- */

export async function startCampaign(
  actor: Actor,
  id: string,
  expectedCount: number,
): Promise<CampaignView> {
  const companyId = need(actor);
  const campaign = await getCampaign(companyId, id);
  if (campaign.status !== 'draft') throw new ConflictError('Only a draft can be started.');
  const audience = await loadAudience(companyId, campaign.audience);
  if (audience.length === 0) throw new ValidationError('No client matches the audience.');
  if (audience.length !== expectedCount)
    throw new ValidationError(
      `The audience changed: ${audience.length} client(s) match now, not ${expectedCount}. Check and confirm again.`,
    );
  const settings = await getSettings(companyId);
  const now = new Date();
  const sendAfter = (
    inQuiet(now, settings.quiet) ? quietEnds(now, settings.quiet) : now
  ).toISOString();
  const byLabel = new Map(campaign.variants.map((v) => [v.label, v]));
  const first = campaign.variants[0];
  if (!first) throw new ValidationError('The campaign has no variant.');
  const ids = audience.map((a) => a.id);
  const split = campaign.abEnabled
    ? splitAudience(
        ids,
        campaign.variants.map((v) => v.label),
        campaign.testPercent,
        id,
      )
    : { test: new Map(ids.map((c) => [c, first.label])), holdout: [] as string[] };
  const rows = [
    ...[...split.test.entries()].map(([clientId, label]) => ({
      clientId,
      variant: byLabel.get(label) ?? first,
      held: false,
    })),
    ...split.holdout.map((clientId) => ({ clientId, variant: first, held: true })),
  ];
  const admin = getAdminSupabase();
  const claim = await admin
    .from('messaging_campaigns')
    .update({ status: campaign.abEnabled ? 'testing' : 'running', started_at: now.toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'draft')
    .eq('version', campaign.version)
    .select('id');
  if (claim.error) mapIntegrationError(claim.error);
  if ((claim.data ?? []).length === 0)
    throw new ConflictError('The campaign changed. Reload and try again.');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      company_id: companyId,
      idempotency_key: `camp:${id}:${r.clientId}`,
      kind: 'campaign',
      route_kind: 'campaign',
      client_id: r.clientId,
      campaign_id: id,
      variant_id: r.variant.id,
      status: r.held ? 'held' : 'queued',
      send_after: sendAfter,
      channel_order: r.variant.channelOrder,
      subject: r.variant.subject,
      body: r.variant.body,
      whatsapp_template_id: r.variant.whatsappTemplateId,
      whatsapp_values: r.variant.whatsappValues,
      created_by: actor.userId,
    }));
    const ins = await admin.from('messaging_messages').insert(chunk);
    if (ins.error) mapIntegrationError(ins.error);
  }
  await record(companyId, 'messaging.campaign_started', 'messaging_campaign', id, {
    clients: ids.length,
    test: split.test.size,
    held: split.holdout.length,
  });
  return getCampaign(companyId, id);
}

export async function cancelCampaign(actor: Actor, id: string): Promise<CampaignView> {
  const companyId = need(actor);
  const campaign = await getCampaign(companyId, id);
  if (campaign.status === 'finished' || campaign.status === 'cancelled')
    throw new ConflictError('This campaign is over.');
  const admin = getAdminSupabase();
  const upd = await admin
    .from('messaging_campaigns')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', campaign.version)
    .select('id');
  if (upd.error) mapIntegrationError(upd.error);
  if ((upd.data ?? []).length === 0)
    throw new ConflictError('The campaign changed. Reload and try again.');
  const msgs = await admin
    .from('messaging_messages')
    .update({ status: 'cancelled' })
    .eq('campaign_id', id)
    .in('status', ['queued', 'held']);
  if (msgs.error) mapIntegrationError(msgs.error);
  await record(companyId, 'messaging.campaign_cancelled', 'messaging_campaign', id, {});
  return getCampaign(companyId, id);
}

/* ---------- report ---------- */

export interface CampaignReport {
  campaign: CampaignView;
  counts: Record<string, number>;
  variants: {
    label: string;
    messages: number;
    sent: number;
    delivered: number;
    engaged: number;
    engagedRate: string | null;
  }[];
  channels: ReturnType<typeof channelReport>;
  skipReasons: Record<string, number>;
  cost: string;
}

export async function campaignReport(companyId: string, id: string): Promise<CampaignReport> {
  const campaign = await getCampaign(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .select('variant_id, status, channel, delivered, engaged_at, cost, attempts')
    .eq('campaign_id', id)
    .is('deleted_at', null)
    .limit(CAMPAIGN_MAX_AUDIENCE + 10);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const counts: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  let cost = Money.zero();
  for (const r of rows) {
    counts[String(r.status)] = (counts[String(r.status)] ?? 0) + 1;
    cost = cost.add(Money.parse(String(r.cost ?? 0)));
    if (r.status === 'skipped' || r.status === 'failed')
      for (const a of (r.attempts as { reason?: string | null }[] | null) ?? [])
        if (a.reason) reasons[a.reason] = (reasons[a.reason] ?? 0) + 1;
  }
  const variants = campaign.variants.map((v) => {
    const mine = rows.filter((r) => String(r.variant_id) === v.id);
    const sentRows = mine.filter((r) => r.status === 'sent');
    const delivered = sentRows.filter((r) => r.delivered === true).length;
    const engaged = sentRows.filter((r) => r.engaged_at !== null).length;
    return {
      label: v.label,
      messages: mine.filter((r) => r.status !== 'held').length,
      sent: sentRows.length,
      delivered,
      engaged,
      engagedRate: rate(engaged, delivered),
    };
  });
  return {
    campaign,
    counts,
    variants,
    channels: channelReport(
      rows.map((r) => ({
        channel: r.channel === null ? null : String(r.channel),
        delivered: r.delivered === true,
        engaged: r.engaged_at !== null,
      })),
    ),
    skipReasons: reasons,
    cost: cost.toDbString(),
  };
}

/* ---------- cron: winner and finish ---------- */

async function chooseWinner(campaign: CampaignView, companyId: string): Promise<void> {
  const admin = getAdminSupabase();
  const settings = await getSettings(companyId);
  const startedAt = Date.parse(campaign.startedAt ?? new Date().toISOString());
  const hours = (Date.now() - startedAt) / 3_600_000;
  if (hours < campaign.decideAfterHours) return;
  const { data, error } = await admin
    .from('messaging_messages')
    .select('variant_id, delivered, engaged_at')
    .eq('campaign_id', campaign.id)
    .eq('status', 'sent')
    .limit(CAMPAIGN_MAX_AUDIENCE);
  if (error) throw new InternalError(error);
  const stats: VariantStats[] = campaign.variants.map((v) => {
    const mine = (data ?? []).filter((r) => String(r.variant_id) === v.id);
    return {
      label: v.label,
      variantId: v.id,
      delivered: mine.filter((r) => r.delivered === true).length,
      engaged: mine.filter((r) => r.engaged_at !== null).length,
    };
  });
  const final = hours >= campaign.decideAfterHours + AB_MAX_EXTENSION_HOURS;
  let winner = pickWinner(stats, settings.abMinSample, final);
  const first = campaign.variants[0];
  if (winner === null && final && first)
    winner = {
      variantId: first.id,
      label: first.label,
      reason: `No message was delivered during the test, so variant ${first.label} was used.`,
    };
  if (winner === null) return;
  const won = campaign.variants.find((v) => v.id === winner?.variantId);
  if (!won) return;
  const upd = await admin
    .from('messaging_campaigns')
    .update({
      winner_variant_id: won.id,
      winner_chosen_at: new Date().toISOString(),
      winner_reason: winner.reason,
      status: 'running',
    })
    .eq('id', campaign.id)
    .eq('status', 'testing')
    .select('id');
  if (upd.error) throw new InternalError(upd.error);
  if ((upd.data ?? []).length === 0) return;
  const release = await admin
    .from('messaging_messages')
    .update({
      status: 'queued',
      send_after: new Date().toISOString(),
      variant_id: won.id,
      channel_order: won.channelOrder,
      subject: won.subject,
      body: won.body,
      whatsapp_template_id: won.whatsappTemplateId,
      whatsapp_values: won.whatsappValues,
    })
    .eq('campaign_id', campaign.id)
    .eq('status', 'held');
  if (release.error) throw new InternalError(release.error);
  await record(companyId, 'messaging.campaign_winner', 'messaging_campaign', campaign.id, {
    winner: won.label,
    reason: winner.reason,
  });
}

/** Cron, every 5 minutes: picks the winner of A/B tests that are due and finishes campaigns with nothing left to send. */
export async function runCampaigns(): Promise<{ checked: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('messaging_campaigns')
    .select('id, company_id, status')
    .in('status', ['testing', 'running'])
    .is('deleted_at', null)
    .limit(200);
  if (error) throw new InternalError(error);
  for (const c of data ?? []) {
    try {
      const companyId = String(c.company_id);
      const campaign = await getCampaign(companyId, String(c.id));
      if (campaign.status === 'testing') {
        await chooseWinner(campaign, companyId);
        continue;
      }
      const left = await admin
        .from('messaging_messages')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .in('status', ['queued', 'held', 'sending']);
      if (left.error) throw new InternalError(left.error);
      if ((left.count ?? 0) === 0)
        await admin
          .from('messaging_campaigns')
          .update({ status: 'finished', finished_at: new Date().toISOString() })
          .eq('id', campaign.id)
          .eq('status', 'running');
    } catch (e) {
      log.error('campaign check failed', { campaignId: String(c.id), error: e });
    }
  }
  return { checked: (data ?? []).length };
}
