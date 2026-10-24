// path: services/whatsapp/campaigns.ts
// WhatsApp campaigns: one approved template to a segment of clients, one person once. The audience is fixed when the campaign
// starts (clients with no valid number, who asked not to be contacted, who opted out or never opted in are kept as skipped rows
// with the reason). Sending goes in small batches every minute and never beyond the daily limit of people the company may start a
// conversation with; the rest waits for the next day. A dry run only records the text for each person. A finished campaign is
// final; failures that can be retried are copied into a new follow-up campaign. The report counts statuses and failure reasons.
import 'server-only';
import {
  CAMPAIGN_MAX_RUNNING,
  CAMPAIGN_TICK_BATCH,
  CAMPAIGN_TIER_FALLBACK,
} from '@/config/s16-whatsapp';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  buildAudience,
  campaignInput,
  deliveryShare,
  fillValues,
  isPermanentFailure,
  remainingToday,
  segmentInput,
  type AudienceClient,
  type ClientStats,
  type Segment,
} from '@/lib/whatsapp/automation-rules';
import { renderTemplate, templateVariables, toE164 } from '@/lib/whatsapp/rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record, requireAccount } from './db';
import { clientContext } from './recipients';
import { deliver } from './send';
import { getTemplate } from './templates';

const log = createLogger({ service: 'whatsapp-campaigns' });
const COLUMNS =
  'id, name, template_id, values, segment, status, dry_run, scheduled_at, started_at, finished_at, version, created_at';

interface Row {
  id: string;
  name: string;
  template_id: string;
  values: Record<string, string>;
  segment: Segment;
  status: string;
  dry_run: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  version: number;
  created_at: string;
}

export interface CampaignView {
  id: string;
  name: string;
  templateId: string;
  values: Record<string, string>;
  segment: Segment;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'done' | 'cancelled';
  dryRun: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  version: number;
  createdAt: string;
}

const STATES = ['draft', 'scheduled', 'running', 'paused', 'done', 'cancelled'] as const;
const toView = (r: Row): CampaignView => ({
  id: r.id,
  name: r.name,
  templateId: r.template_id,
  values: r.values,
  segment: r.segment,
  status: STATES.find((s) => s === r.status) ?? 'draft',
  dryRun: r.dry_run,
  scheduledAt: r.scheduled_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  version: r.version,
  createdAt: r.created_at,
});

export async function listCampaigns(companyId: string): Promise<CampaignView[]> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_campaigns')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function getCampaign(companyId: string, id: string): Promise<CampaignView> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_campaigns')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

async function checkValues(
  companyId: string,
  templateId: string,
  values: Record<string, string>,
): Promise<void> {
  const template = await getTemplate(companyId, templateId);
  const missing = templateVariables(template.components).filter(
    (v) => (values[v] ?? '').trim() === '',
  );
  if (missing.length > 0)
    throw new ValidationError(`Give a value for: ${missing.map((m) => `{{${m}}}`).join(', ')}.`);
}

export async function createCampaign(actor: Actor, input: unknown): Promise<CampaignView> {
  const companyId = need(actor);
  const parsed = campaignInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The campaign is not valid.');
  const d = parsed.data;
  await checkValues(companyId, d.templateId, d.values);
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_campaigns')
    .insert({
      company_id: companyId,
      name: d.name,
      template_id: d.templateId,
      values: d.values,
      segment: d.segment,
      dry_run: d.dryRun,
      scheduled_at: null,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data as unknown as Row);
  await record(companyId, 'whatsapp.campaign_created', 'whatsapp_campaign', view.id, {
    name: d.name,
    dryRun: d.dryRun,
  });
  return view;
}

/* ---------- the audience ---------- */

async function loadAudience(
  companyId: string,
  seg: Segment,
): Promise<ReturnType<typeof buildAudience>> {
  const admin = getAdminSupabase();
  const clients = await admin
    .from('clients')
    .select('id, name, phone, tags, do_not_contact')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('phone', '')
    .order('id', { ascending: true })
    .limit(20_000);
  if (clients.error) throw new InternalError(clients.error);
  const invoices = await admin
    .from('invoices')
    .select('client_id, amount_due, issue_date, status')
    .eq('company_id', companyId)
    .not('client_id', 'is', null)
    .not('status', 'in', '(draft,void)')
    .is('deleted_at', null)
    .limit(100_000);
  if (invoices.error) throw new InternalError(invoices.error);
  const stats = new Map<string, { balance: Money; open: number; last: string | null }>();
  for (const i of invoices.data ?? []) {
    const key = String(i.client_id);
    const s = stats.get(key) ?? { balance: Money.zero(), open: 0, last: null };
    if (['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'].includes(String(i.status))) {
      s.balance = s.balance.add(Money.parse(String(i.amount_due ?? 0)));
      s.open += 1;
    }
    const issued = String(i.issue_date);
    if (s.last === null || issued > s.last) s.last = issued;
    stats.set(key, s);
  }
  const contacts = await admin
    .from('whatsapp_contacts')
    .select('phone_e164, opt_status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(100_000);
  if (contacts.error) throw new InternalError(contacts.error);
  const opt = new Map(
    (contacts.data ?? []).map((c) => [String(c.phone_e164), String(c.opt_status)]),
  );
  const rows = (clients.data ?? []).map((c) => {
    const s = stats.get(String(c.id));
    const client: AudienceClient & { stats: ClientStats } = {
      id: String(c.id),
      name: String(c.name),
      contactName: '',
      phone: String(c.phone),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      doNotContact: c.do_not_contact === true,
      stats: {
        balance: (s?.balance ?? Money.zero()).toDbString(),
        openInvoices: s?.open ?? 0,
        lastInvoiceDate: s?.last ?? null,
      },
    };
    return client;
  });
  return buildAudience(rows, seg, toE164, (phone) => {
    const o = opt.get(phone);
    return o === 'opted_in' || o === 'opted_out' ? o : 'unknown';
  });
}

/** Counts the people a segment reaches, without starting anything. */
export async function previewAudience(
  actor: Actor,
  segmentInputValue: unknown,
): Promise<{ total: number; pending: number; skipped: number; reasons: Record<string, number> }> {
  const companyId = need(actor);
  const parsed = segmentInput.safeParse(segmentInputValue);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The segment is not valid.');
  const audience = await loadAudience(companyId, parsed.data);
  const reasons: Record<string, number> = {};
  for (const a of audience) if (a.reason) reasons[a.reason] = (reasons[a.reason] ?? 0) + 1;
  return {
    total: audience.length,
    pending: audience.filter((a) => a.status === 'pending').length,
    skipped: audience.filter((a) => a.status === 'skipped').length,
    reasons,
  };
}

/* ---------- life of a campaign ---------- */

async function setStatus(
  companyId: string,
  id: string,
  from: readonly string[],
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_campaigns')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .in('status', [...from])
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The campaign is not in a state that allows this.');
}

/** Starts a draft (fixes the audience) or resumes a paused one. With a time in the future a draft waits as scheduled. */
export async function startCampaign(
  actor: Actor,
  id: string,
  scheduledAt: string | null,
): Promise<CampaignView> {
  const companyId = need(actor);
  const campaign = await getCampaign(companyId, id);
  const admin = getAdminSupabase();
  if (campaign.status === 'paused') {
    await setStatus(companyId, id, ['paused'], { status: 'running' });
  } else if (campaign.status === 'draft') {
    const template = await getTemplate(companyId, campaign.templateId);
    if (!campaign.dryRun && template.status !== 'APPROVED')
      throw new ValidationError(
        'Only an approved template can be sent. Run it as a dry run first.',
      );
    if (!campaign.dryRun) {
      const account = await requireAccount(companyId);
      if (account.status !== 'active') throw new ConflictError('WhatsApp sending is paused.');
    }
    const audience = await loadAudience(companyId, campaign.segment);
    if (audience.filter((a) => a.status === 'pending').length === 0)
      throw new ValidationError('No one in this segment can be messaged.');
    for (let i = 0; i < audience.length; i += 500) {
      const chunk = audience.slice(i, i + 500).map((a) => ({
        company_id: companyId,
        campaign_id: id,
        client_id: a.clientId,
        phone_e164: a.phone,
        name: a.name,
        status: a.status,
        reason: a.reason,
      }));
      const { error } = await admin.from('whatsapp_campaign_items').insert(chunk);
      if (error && error.code !== '23505') mapIntegrationError(error);
    }
    const future = scheduledAt !== null && Date.parse(scheduledAt) > Date.now();
    await setStatus(
      companyId,
      id,
      ['draft'],
      future
        ? { status: 'scheduled', scheduled_at: scheduledAt }
        : { status: 'running', started_at: new Date().toISOString() },
    );
  } else {
    throw new ConflictError('The campaign is not in a state that allows this.');
  }
  await record(companyId, 'whatsapp.campaign_started', 'whatsapp_campaign', id, {
    dryRun: campaign.dryRun,
  });
  return getCampaign(companyId, id);
}

export async function pauseCampaign(actor: Actor, id: string): Promise<CampaignView> {
  const companyId = need(actor);
  await setStatus(companyId, id, ['scheduled', 'running'], { status: 'paused' });
  await record(companyId, 'whatsapp.campaign_paused', 'whatsapp_campaign', id, {});
  return getCampaign(companyId, id);
}

export async function cancelCampaign(actor: Actor, id: string): Promise<CampaignView> {
  const companyId = need(actor);
  await setStatus(companyId, id, ['draft', 'scheduled', 'running', 'paused'], {
    status: 'cancelled',
    finished_at: new Date().toISOString(),
  });
  const { error } = await getAdminSupabase()
    .from('whatsapp_campaign_items')
    .update({ status: 'skipped', reason: 'The campaign was cancelled.' })
    .eq('company_id', companyId)
    .eq('campaign_id', id)
    .eq('status', 'pending');
  if (error) mapIntegrationError(error);
  await record(companyId, 'whatsapp.campaign_cancelled', 'whatsapp_campaign', id, {});
  return getCampaign(companyId, id);
}

/** Copies the failed items that retrying could fix into a new campaign that starts at once. */
export async function retryFailed(actor: Actor, id: string): Promise<CampaignView> {
  const companyId = need(actor);
  const source = await getCampaign(companyId, id);
  if (source.dryRun) throw new ValidationError('A dry run has nothing to send again.');
  const admin = getAdminSupabase();
  const items = await admin
    .from('whatsapp_campaign_items')
    .select('client_id, phone_e164, name, error_code')
    .eq('company_id', companyId)
    .eq('campaign_id', id)
    .eq('status', 'failed')
    .limit(5000);
  if (items.error) throw new InternalError(items.error);
  const retryable = (items.data ?? []).filter(
    (i) => !isPermanentFailure(i.error_code === null ? null : Number(i.error_code)),
  );
  if (retryable.length === 0) throw new ValidationError('No failed message can be sent again.');
  const made = await admin
    .from('whatsapp_campaigns')
    .insert({
      company_id: companyId,
      name: `${source.name} (again)`.slice(0, 100),
      template_id: source.templateId,
      values: source.values,
      segment: source.segment,
      dry_run: false,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (made.error) mapIntegrationError(made.error);
  const next = toView(made.data as unknown as Row);
  for (let i = 0; i < retryable.length; i += 500) {
    const { error } = await admin.from('whatsapp_campaign_items').insert(
      retryable.slice(i, i + 500).map((r) => ({
        company_id: companyId,
        campaign_id: next.id,
        client_id: r.client_id,
        phone_e164: r.phone_e164,
        name: r.name,
        status: 'pending',
      })),
    );
    if (error) mapIntegrationError(error);
  }
  await setStatus(companyId, next.id, ['draft'], {
    status: 'running',
    started_at: new Date().toISOString(),
  });
  await record(companyId, 'whatsapp.campaign_retry', 'whatsapp_campaign', next.id, {
    from: id,
    items: retryable.length,
  });
  return getCampaign(companyId, next.id);
}

/* ---------- sending (cron, every minute) ---------- */

interface ItemRow {
  id: string;
  client_id: string | null;
  phone_e164: string;
  attempts: number;
}

async function finishItem(
  id: string,
  status: 'sent' | 'dry_run' | 'skipped' | 'failed',
  reason: string | null,
  extra: { renderedText?: string; messageId?: string | null; errorCode?: number | null } = {},
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('whatsapp_campaign_items')
    .update({
      status,
      reason: reason === null ? null : reason.slice(0, 300),
      rendered_text: (extra.renderedText ?? '').slice(0, 4096),
      message_id: extra.messageId ?? null,
      error_code: extra.errorCode ?? null,
    })
    .eq('id', id);
  if (error) throw new InternalError(error);
}

/** One batch of one campaign. Returns how many items were handled. */
export async function processCampaign(campaign: CampaignView): Promise<number> {
  const admin = getAdminSupabase();
  const companyId = (
    await admin.from('whatsapp_campaigns').select('company_id').eq('id', campaign.id).single()
  ).data?.company_id as string | undefined;
  if (!companyId) return 0;
  const template = await getTemplate(companyId, campaign.templateId);
  let remaining = Number.POSITIVE_INFINITY;
  if (!campaign.dryRun) {
    const account = await requireAccount(companyId);
    if (account.status !== 'active') return 0;
    const used = await admin.rpc('kd_whatsapp_template_recipients_24h', { p_company: companyId });
    if (used.error) throw new InternalError(used.error);
    remaining = remainingToday(account.daily_limit || CAMPAIGN_TIER_FALLBACK, Number(used.data));
  }
  const batch = await admin
    .from('whatsapp_campaign_items')
    .select('id, client_id, phone_e164, attempts')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(CAMPAIGN_TICK_BATCH);
  if (batch.error) throw new InternalError(batch.error);
  let handled = 0;
  for (const item of (batch.data ?? []) as unknown as ItemRow[]) {
    if (remaining <= 0) break;
    const client = item.client_id ? await clientContext(companyId, item.client_id) : null;
    if (item.client_id && (!client || client.doNotContact)) {
      await finishItem(
        item.id,
        'skipped',
        client ? 'The client asked not to be contacted.' : 'The client no longer exists.',
      );
      handled += 1;
      continue;
    }
    const filled = fillValues(campaign.values, {
      'client.name': client?.name ?? '',
      'client.contact_name':
        client && client.contactName !== '' ? client.contactName : (client?.name ?? ''),
    });
    const empty = templateVariables(template.components).filter(
      (v) => (filled.values[v] ?? '') === '',
    );
    if (empty.length > 0) {
      await finishItem(
        item.id,
        'skipped',
        `No value for ${empty.map((e) => `{{${e}}}`).join(', ')}.`,
      );
      handled += 1;
      continue;
    }
    const text = renderTemplate(template.components, filled.values);
    if (campaign.dryRun) {
      await finishItem(item.id, 'dry_run', null, { renderedText: text });
      handled += 1;
      continue;
    }
    try {
      const message = await deliver({
        companyId,
        userId: null,
        to: item.phone_e164,
        clientId: item.client_id,
        kind: 'template',
        templateId: campaign.templateId,
        values: filled.values,
        origin: 'campaign',
        idempotencyKey: `campaign:${campaign.id}:${item.id}`,
      });
      if (message.status === 'failed')
        await finishItem(item.id, 'failed', message.errorText, {
          renderedText: text,
          messageId: message.id,
          errorCode: message.errorCode,
        });
      else {
        await finishItem(item.id, 'sent', null, { renderedText: text, messageId: message.id });
        remaining -= 1;
      }
    } catch (error) {
      if (
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      )
        await finishItem(item.id, 'skipped', error.message, { renderedText: text });
      else if (error instanceof ConflictError) return handled;
      else {
        log.error('campaign item failed', { itemId: item.id, error });
        await admin
          .from('whatsapp_campaign_items')
          .update({
            attempts: item.attempts + 1,
            ...(item.attempts + 1 >= 3
              ? { status: 'failed', reason: 'The message could not be sent.' }
              : {}),
          })
          .eq('id', item.id);
      }
    }
    handled += 1;
  }
  const left = await admin
    .from('whatsapp_campaign_items')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending');
  if (left.error) throw new InternalError(left.error);
  if ((left.count ?? 0) === 0) {
    const done = await admin
      .from('whatsapp_campaigns')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .eq('status', 'running');
    if (done.error) throw new InternalError(done.error);
    await record(companyId, 'whatsapp.campaign_finished', 'whatsapp_campaign', campaign.id, {
      dryRun: campaign.dryRun,
    });
  }
  return handled;
}

export async function runCampaigns(): Promise<{ campaigns: number; handled: number }> {
  const admin = getAdminSupabase();
  const due = await admin
    .from('whatsapp_campaigns')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .is('deleted_at', null);
  if (due.error) throw new InternalError(due.error);
  const running = await admin
    .from('whatsapp_campaigns')
    .select(COLUMNS)
    .eq('status', 'running')
    .is('deleted_at', null)
    .order('started_at', { ascending: true })
    .limit(CAMPAIGN_MAX_RUNNING);
  if (running.error) throw new InternalError(running.error);
  let handled = 0;
  const campaigns = ((running.data ?? []) as unknown as Row[]).map(toView);
  for (const c of campaigns) {
    try {
      handled += await processCampaign(c);
    } catch (error) {
      log.error('campaign tick failed', { campaignId: c.id, error });
    }
  }
  return { campaigns: campaigns.length, handled };
}

/* ---------- report ---------- */

export interface CampaignReport {
  campaign: CampaignView;
  items: {
    pending: number;
    sent: number;
    dryRun: number;
    skipped: number;
    failed: number;
    total: number;
  };
  messages: { sent: number; delivered: number; read: number; failed: number };
  deliveredShare: string;
  readShare: string;
  failures: { reason: string; count: number }[];
  skips: { reason: string; count: number }[];
  retryable: number;
  sample: { name: string; phone: string; status: string; reason: string | null; text: string }[];
}

export async function campaignReport(companyId: string, id: string): Promise<CampaignReport> {
  const campaign = await getCampaign(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_campaign_items')
    .select(
      'name, phone_e164, status, reason, rendered_text, error_code, whatsapp_messages(status, error_text)',
    )
    .eq('company_id', companyId)
    .eq('campaign_id', id)
    .order('id', { ascending: true })
    .limit(5000);
  if (error) throw new InternalError(error);
  const items = { pending: 0, sent: 0, dryRun: 0, skipped: 0, failed: 0, total: 0 };
  const messages = { sent: 0, delivered: 0, read: 0, failed: 0 };
  const failures = new Map<string, number>();
  const skips = new Map<string, number>();
  let retryable = 0;
  for (const r of data ?? []) {
    items.total += 1;
    const status = String(r.status);
    if (status === 'pending') items.pending += 1;
    else if (status === 'sent') items.sent += 1;
    else if (status === 'dry_run') items.dryRun += 1;
    else if (status === 'skipped') items.skipped += 1;
    else if (status === 'failed') items.failed += 1;
    const reason = r.reason === null ? 'Unknown reason' : String(r.reason);
    if (status === 'skipped') skips.set(reason, (skips.get(reason) ?? 0) + 1);
    if (status === 'failed') {
      failures.set(reason, (failures.get(reason) ?? 0) + 1);
      if (!isPermanentFailure(r.error_code === null ? null : Number(r.error_code))) retryable += 1;
    }
    const m = Array.isArray(r.whatsapp_messages) ? r.whatsapp_messages[0] : r.whatsapp_messages;
    if (m) {
      const ms = String((m as { status: unknown }).status);
      if (ms === 'sent') messages.sent += 1;
      else if (ms === 'delivered') messages.delivered += 1;
      else if (ms === 'read') messages.read += 1;
      else if (ms === 'failed') {
        messages.failed += 1;
        const why = String(
          (m as { error_text: unknown }).error_text ?? 'WhatsApp could not deliver the message.',
        );
        if (status !== 'failed') failures.set(why, (failures.get(why) ?? 0) + 1);
      }
    }
  }
  const accepted = messages.sent + messages.delivered + messages.read;
  const sorted = (m: Map<string, number>): { reason: string; count: number }[] =>
    [...m.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  return {
    campaign,
    items,
    messages,
    deliveredShare: deliveryShare(messages.delivered + messages.read, accepted + messages.failed),
    readShare: deliveryShare(messages.read, accepted + messages.failed),
    failures: sorted(failures),
    skips: sorted(skips),
    retryable,
    sample: (data ?? []).slice(0, 100).map((r) => ({
      name: String(r.name),
      phone: String(r.phone_e164),
      status: String(r.status),
      reason: r.reason === null ? null : String(r.reason),
      text: String(r.rendered_text ?? ''),
    })),
  };
}
