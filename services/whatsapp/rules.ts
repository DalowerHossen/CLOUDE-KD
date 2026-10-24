// path: services/whatsapp/rules.ts
// WhatsApp rules: "when this happens, send this template". A rule starts on an event (an invoice sent or paid, a payment, a new
// client) or a number of days before an invoice is due. A rule is a dry run until the owner switches it to live: a dry run only
// records the text that would be sent. Each rule and source (the event id, or the invoice for a due-date rule) is processed once,
// kept in the run table, so a repeated event sends nothing twice. A delay holds the run until its time.
import 'server-only';
import {
  RULE_PROCESSING_STALE_MINUTES,
  RULE_RUN_BATCH,
  REMINDER_EVENTS,
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
  dueDateFor,
  fillValues,
  ruleInput,
  ruleUpdate,
  runDueAt,
} from '@/lib/whatsapp/automation-rules';
import { renderTemplate, templateVariables, toE164 } from '@/lib/whatsapp/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, DomainEvent } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { refsOf, resolveRecipient } from './recipients';
import { deliver } from './send';
import { getTemplate } from './templates';

const log = createLogger({ service: 'whatsapp-rules' });
const COLUMNS =
  'id, name, trigger_kind, event_name, days_before, template_id, values, enabled, dry_run, delay_minutes, version, created_at';

interface Row {
  id: string;
  name: string;
  trigger_kind: string;
  event_name: string | null;
  days_before: number | null;
  template_id: string;
  values: Record<string, string>;
  enabled: boolean;
  dry_run: boolean;
  delay_minutes: number;
  version: number;
  created_at: string;
}

export interface RuleView {
  id: string;
  name: string;
  triggerKind: 'event' | 'due_soon';
  eventName: string | null;
  daysBefore: number | null;
  templateId: string;
  values: Record<string, string>;
  enabled: boolean;
  dryRun: boolean;
  delayMinutes: number;
  version: number;
}

const toView = (r: Row): RuleView => ({
  id: r.id,
  name: r.name,
  triggerKind: r.trigger_kind === 'due_soon' ? 'due_soon' : 'event',
  eventName: r.event_name,
  daysBefore: r.days_before,
  templateId: r.template_id,
  values: r.values,
  enabled: r.enabled,
  dryRun: r.dry_run,
  delayMinutes: r.delay_minutes,
  version: r.version,
});

export async function listRules(companyId: string): Promise<RuleView[]> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function getRule(companyId: string, id: string): Promise<RuleView> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

/** Every body parameter of the template needs a value (a text or a token). */
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

export async function createRule(actor: Actor, input: unknown): Promise<RuleView> {
  const companyId = need(actor);
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The rule is not valid.');
  const d = parsed.data;
  await checkValues(companyId, d.templateId, d.values);
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .insert({
      company_id: companyId,
      name: d.name,
      trigger_kind: d.triggerKind,
      event_name: d.eventName,
      days_before: d.daysBefore,
      template_id: d.templateId,
      values: d.values,
      enabled: d.enabled,
      dry_run: d.dryRun,
      delay_minutes: d.delayMinutes,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data as unknown as Row);
  await record(companyId, 'whatsapp.rule_created', 'whatsapp_rule', view.id, {
    trigger: d.triggerKind,
    event: d.eventName,
    daysBefore: d.daysBefore,
    dryRun: d.dryRun,
  });
  return view;
}

export async function updateRule(actor: Actor, id: string, input: unknown): Promise<RuleView> {
  const companyId = need(actor);
  const parsed = ruleUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await getRule(companyId, id);
  const templateId = d.templateId ?? current.templateId;
  const values = d.values ?? current.values;
  if (d.templateId !== undefined || d.values !== undefined)
    await checkValues(companyId, templateId, values);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.templateId !== undefined) patch.template_id = d.templateId;
  if (d.values !== undefined) patch.values = d.values;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  if (d.dryRun !== undefined) patch.dry_run = d.dryRun;
  if (d.delayMinutes !== undefined) patch.delay_minutes = d.delayMinutes;
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The rule changed. Reload and try again.');
  await record(companyId, 'whatsapp.rule_changed', 'whatsapp_rule', id, {
    fields: Object.keys(patch),
  });
  return getRule(companyId, id);
}

export async function deleteRule(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await getRule(companyId, id);
  const { error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'whatsapp.rule_removed', 'whatsapp_rule', id, {});
}

export interface RunView {
  id: string;
  ruleId: string;
  sourceKey: string;
  status: string;
  reason: string | null;
  renderedText: string;
  dueAt: string;
  createdAt: string;
}

export async function listRuns(companyId: string, ruleId?: string, limit = 50): Promise<RunView[]> {
  let q = getAdminSupabase()
    .from('whatsapp_rule_runs')
    .select('id, rule_id, source_key, status, reason, rendered_text, due_at, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (ruleId) q = q.eq('rule_id', ruleId);
  const { data, error } = await q
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    ruleId: String(r.rule_id),
    sourceKey: String(r.source_key),
    status: String(r.status),
    reason: r.reason === null ? null : String(r.reason),
    renderedText: String(r.rendered_text ?? ''),
    dueAt: String(r.due_at),
    createdAt: String(r.created_at),
  }));
}

/** Writes a run for a rule and source; false when the same source was already written. */
async function addRun(
  companyId: string,
  ruleId: string,
  sourceKey: string,
  payload: Record<string, unknown>,
  dueAt: string,
): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rule_runs')
    .insert({
      company_id: companyId,
      rule_id: ruleId,
      source_key: sourceKey,
      payload,
      due_at: dueAt,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    mapIntegrationError(error);
  }
  return String((data as { id: string }).id);
}

/** For a domain event: one run per enabled rule that listens to it; runs without a delay are sent at once. */
export async function handleRuleEvent(event: DomainEvent): Promise<{ runs: number }> {
  if (event.companyId === null) return { runs: 0 };
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_rules')
    .select('id, delay_minutes')
    .eq('company_id', event.companyId)
    .eq('trigger_kind', 'event')
    .eq('event_name', event.name)
    .eq('enabled', true)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const refs = refsOf(event.payload);
  let runs = 0;
  for (const rule of data ?? []) {
    const due = runDueAt(event.occurredAt, Number(rule.delay_minutes));
    const id = await addRun(
      event.companyId,
      String(rule.id),
      event.id,
      { ...refs, event: event.name },
      due,
    );
    if (id === null) continue;
    runs += 1;
    if (Number(rule.delay_minutes) === 0)
      await processRun(id).catch((e) => log.error('rule run failed', { id, error: e }));
  }
  return { runs };
}

interface RunRow {
  id: string;
  company_id: string;
  rule_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}

async function finishRun(
  id: string,
  status: 'sent' | 'dry_run' | 'skipped' | 'failed',
  reason: string | null,
  extra: { renderedText?: string; messageId?: string | null } = {},
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('whatsapp_rule_runs')
    .update({
      status,
      reason: reason === null ? null : reason.slice(0, 300),
      rendered_text: (extra.renderedText ?? '').slice(0, 4096),
      message_id: extra.messageId ?? null,
    })
    .eq('id', id);
  if (error) throw new InternalError(error);
}

/** Sends (or, for a dry run, only renders) one run. Claimed first, so two workers never send the same run. */
export async function processRun(runId: string): Promise<'done' | 'busy'> {
  const admin = getAdminSupabase();
  const claim = await admin
    .from('whatsapp_rule_runs')
    .update({ status: 'processing' })
    .eq('id', runId)
    .eq('status', 'pending')
    .select('id, company_id, rule_id, payload, attempts');
  if (claim.error) throw new InternalError(claim.error);
  const run = (claim.data ?? [])[0] as unknown as RunRow | undefined;
  if (!run) return 'busy';
  await admin
    .from('whatsapp_rule_runs')
    .update({ attempts: run.attempts + 1 })
    .eq('id', run.id);
  try {
    const rule = await getRule(run.company_id, run.rule_id).catch(() => null);
    if (!rule || !rule.enabled) {
      await finishRun(run.id, 'skipped', 'The rule is off.');
      return 'done';
    }
    const recipient = await resolveRecipient(run.company_id, refsOf(run.payload));
    if (!recipient) {
      await finishRun(run.id, 'skipped', 'No client was found for this event.');
      return 'done';
    }
    if (recipient.doNotContact) {
      await finishRun(run.id, 'skipped', 'The client asked not to be contacted.');
      return 'done';
    }
    if (rule.triggerKind === 'due_soon' || REMINDER_EVENTS.includes(rule.eventName ?? '')) {
      if (recipient.remindersOptOut) {
        await finishRun(run.id, 'skipped', 'The client asked for no payment reminders.');
        return 'done';
      }
    }
    const phone = toE164(recipient.phone);
    if (phone === null) {
      await finishRun(run.id, 'skipped', 'The client has no valid WhatsApp number.');
      return 'done';
    }
    const template = await getTemplate(run.company_id, rule.templateId);
    const filled = fillValues(rule.values, recipient.context);
    const needed = templateVariables(template.components);
    const empty = needed.filter((v) => (filled.values[v] ?? '') === '');
    if (empty.length > 0) {
      await finishRun(
        run.id,
        'skipped',
        `No value for ${empty.map((e) => `{{${e}}}`).join(', ')}.`,
      );
      return 'done';
    }
    const text = renderTemplate(template.components, filled.values);
    if (rule.dryRun) {
      await finishRun(
        run.id,
        'dry_run',
        template.status === 'APPROVED' ? null : 'The template is not approved yet.',
        {
          renderedText: text,
        },
      );
      return 'done';
    }
    try {
      const message = await deliver({
        companyId: run.company_id,
        userId: null,
        to: phone,
        clientId: recipient.clientId,
        kind: 'template',
        templateId: rule.templateId,
        values: filled.values,
        origin: 'rule',
        idempotencyKey: `rule:${run.id}`,
      });
      await finishRun(run.id, message.status === 'failed' ? 'failed' : 'sent', message.errorText, {
        renderedText: text,
        messageId: message.id,
      });
    } catch (error) {
      // Opt-out, a closed window, an unapproved template or paused sending: the message is not allowed, so the run is skipped.
      if (
        error instanceof ForbiddenError ||
        error instanceof ConflictError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        await finishRun(run.id, 'skipped', error.message, { renderedText: text });
      } else throw error;
    }
    return 'done';
  } catch (error) {
    log.error('rule run error', { runId: run.id, error });
    await admin
      .from('whatsapp_rule_runs')
      .update({
        status: run.attempts + 1 >= 3 ? 'failed' : 'pending',
        reason: 'The run could not be completed.',
      })
      .eq('id', run.id);
    return 'done';
  }
}

/** Every minute: puts stuck runs back, then processes the runs that are due (delayed ones and any that were left pending). */
export async function runDueRuns(limit: number = RULE_RUN_BATCH): Promise<{ processed: number }> {
  const admin = getAdminSupabase();
  const stale = new Date(Date.now() - RULE_PROCESSING_STALE_MINUTES * 60_000).toISOString();
  const reset = await admin
    .from('whatsapp_rule_runs')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('updated_at', stale);
  if (reset.error) throw new InternalError(reset.error);
  const { data, error } = await admin
    .from('whatsapp_rule_runs')
    .select('id')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let processed = 0;
  for (const row of data ?? []) {
    if ((await processRun(String(row.id))) === 'done') processed += 1;
  }
  return { processed };
}

/** Once a day: for each live due-date rule, a run for every open invoice that falls due in N days. */
export async function sweepDueSoon(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ runs: number }> {
  const admin = getAdminSupabase();
  const rules = await admin
    .from('whatsapp_rules')
    .select('id, company_id, days_before, delay_minutes')
    .eq('trigger_kind', 'due_soon')
    .eq('enabled', true)
    .is('deleted_at', null);
  if (rules.error) throw new InternalError(rules.error);
  let runs = 0;
  for (const rule of rules.data ?? []) {
    const target = dueDateFor(today, Number(rule.days_before));
    const invoices = await admin
      .from('invoices')
      .select('id, client_id')
      .eq('company_id', String(rule.company_id))
      .eq('due_date', target)
      .in('status', ['sent', 'viewed', 'partially_paid'])
      .is('deleted_at', null)
      .limit(2000);
    if (invoices.error) throw new InternalError(invoices.error);
    for (const inv of invoices.data ?? []) {
      const due = runDueAt(new Date().toISOString(), Number(rule.delay_minutes));
      const id = await addRun(
        String(rule.company_id),
        String(rule.id),
        `due_soon:${String(inv.id)}`,
        {
          invoiceId: String(inv.id),
          ...(inv.client_id ? { clientId: String(inv.client_id) } : {}),
          event: 'due_soon',
        },
        due,
      );
      if (id !== null) runs += 1;
    }
  }
  return { runs };
}
