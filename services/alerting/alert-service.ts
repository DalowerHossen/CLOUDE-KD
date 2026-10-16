// path: services/alerting/alert-service.ts
// Alert engine: dedupe (5 minutes), silence windows, escalation of unacknowledged alerts, channels and the on-call roster.
// A critical alert opens a SEV1 incident on its own.
import 'server-only';
import { z } from 'zod';
import { getService, tryGetService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  ALERT_SEVERITIES,
  CHANNEL_KINDS,
  DEDUPE_SECONDS,
  ESCALATE_SECONDS,
  channelsFor,
  incidentSeverityFor,
  opensIncident,
  payloadFor,
  rosterFor,
  type AlertSeverity,
  type AlertView,
} from '@/lib/alerting/policy';
import { authHeaderForSecret } from '@/lib/alerting/auth';
import { safeHttpsRequest, validateOutboundUrl } from '@/lib/security/ssrf';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { openIncident } from '@/services/incident/incident-service';
import type { Actor, EncryptedPayload } from '@/types/contracts';

const log = createLogger({ component: 'alerting' });

export const alertActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('acknowledge'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('resolve'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('create_silence'),
      ruleId: z
        .string()
        .trim()
        .regex(/^(\*|[a-z][a-z0-9_.]*)$/),
      reason: z.string().trim().min(3).max(300),
      hours: z.number().int().min(1).max(168),
    })
    .strict(),
  z.object({ action: z.literal('delete_silence'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('create_channel'),
      name: z.string().trim().min(2).max(80),
      kind: z.enum(CHANNEL_KINDS),
      target: z.string().trim().url().max(500),
      secret: z.string().trim().min(8).max(500).optional(),
      minSeverity: z.enum(ALERT_SEVERITIES).default('high'),
      fromLevel: z.number().int().min(0).max(2).default(0),
    })
    .strict(),
  z.object({ action: z.literal('delete_channel'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('test_channel'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('add_oncall'),
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(254),
      level: z.number().int().min(0).max(2).default(0),
    })
    .strict(),
  z.object({ action: z.literal('remove_oncall'), id: z.string().uuid() }).strict(),
]);
export type AlertAction = z.infer<typeof alertActionSchema>;

const encrypted = z
  .object({ ciphertext: z.string(), iv: z.string(), tag: z.string(), keyVersion: z.number().int() })
  .strict();
const channelRow = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: z.enum(CHANNEL_KINDS),
    target: z.string(),
    credential: z.unknown().nullable(),
    min_severity: z.enum(ALERT_SEVERITIES),
    from_level: z.number().int(),
    enabled: z.boolean(),
  })
  .strip();
type ChannelRow = z.infer<typeof channelRow>;
const rosterRow = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    level: z.number().int(),
    starts_at: z.string(),
    ends_at: z.string().nullable(),
  })
  .strip();
const alertRow = z
  .object({
    id: z.string().uuid(),
    rule_id: z.string(),
    severity: z.enum(ALERT_SEVERITIES),
    title: z.string(),
    body: z.string(),
    status: z.string(),
    occurrences: z.number().int(),
    last_at: z.string(),
    escalation_level: z.number().int(),
  })
  .strip();

export interface RaiseInput {
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  body?: string;
  dedupeKey: string;
  companyId?: string | null;
}

async function secretOf(row: ChannelRow): Promise<string | null> {
  if (row.credential === null) return null;
  const encryption = tryGetService('encryption');
  if (!encryption) return null;
  const bytes = await encryption.decrypt(
    'pii',
    encrypted.parse(row.credential) as EncryptedPayload,
  );
  return new TextDecoder().decode(bytes);
}

async function postToChannel(row: ChannelRow, alert: AlertView): Promise<void> {
  const secret = await secretOf(row);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret && (row.kind === 'webhook' || row.kind === 'sms_gateway'))
    Object.assign(headers, authHeaderForSecret(secret));
  const res = await safeHttpsRequest(row.target, {
    method: 'POST',
    headers,
    body: JSON.stringify(payloadFor(row.kind, alert, secret)),
    maxBytes: 16 * 1024,
    timeoutMs: 8000,
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(`The channel answered with status ${res.status}.`);
}

/** Sends one alert to the channels and the on-call roster for its level. Failures are logged, never thrown. */
export async function dispatch(alert: AlertView): Promise<void> {
  const admin = getAdminSupabase();
  try {
    const [channels, roster] = await Promise.all([
      admin.from('alert_channels').select('*').is('deleted_at', null).eq('enabled', true),
      admin.from('oncall_roster').select('*').is('deleted_at', null),
    ]);
    if (channels.error) throw new InternalError(channels.error);
    if (roster.error) throw new InternalError(roster.error);
    const rows = z.array(channelRow).parse(channels.data);
    const chosen = channelsFor(
      rows.map((r) => ({ ...r, minSeverity: r.min_severity, fromLevel: r.from_level })),
      alert.severity,
      alert.level,
    );
    await Promise.all(
      chosen.map(async (c) => {
        try {
          await postToChannel(c, alert);
        } catch (e) {
          log.warn('alert channel failed', {
            channel: c.id,
            error: e instanceof Error ? e.message : 'failed',
          });
        }
      }),
    );
    const email = tryGetService('email');
    if (!email) return;
    const recipients = rosterFor(
      z
        .array(rosterRow)
        .parse(roster.data)
        .map((r) => ({
          email: r.email,
          level: r.level,
          startsAt: new Date(r.starts_at),
          endsAt: r.ends_at ? new Date(r.ends_at) : null,
        })),
      alert.level,
      new Date(),
    );
    const bucket = Math.floor(Date.now() / (DEDUPE_SECONDS * 1000));
    await Promise.all(
      recipients.map((to) =>
        email
          .send({
            template: 'security.alert',
            to,
            data: { severity: alert.severity, title: alert.title, body: alert.body },
            idempotencyKey: `alert:${alert.id}:${alert.level}:${to}:${bucket}`,
          })
          .catch((e: unknown) =>
            log.warn('alert e-mail failed', { error: e instanceof Error ? e.message : 'failed' }),
          ),
      ),
    );
  } catch (e) {
    log.error('alert dispatch failed', { error: e });
  }
}

const raiseResult = z
  .object({ id: z.string().uuid(), isNew: z.boolean(), notify: z.boolean(), silenced: z.boolean() })
  .strip();

export async function raiseAlert(input: RaiseInput): Promise<string> {
  const { data, error } = await getAdminSupabase().rpc('kd_alert_raise', {
    p_rule: input.ruleId,
    p_severity: input.severity,
    p_title: input.title,
    p_body: input.body ?? '',
    p_dedupe: input.dedupeKey,
    p_company: input.companyId ?? null,
    p_dedupe_seconds: DEDUPE_SECONDS,
    p_escalate_seconds: ESCALATE_SECONDS,
  });
  if (error) throw new InternalError(error);
  const r = raiseResult.parse(data);
  if (r.notify) {
    await dispatch({
      id: r.id,
      ruleId: input.ruleId,
      severity: input.severity,
      title: input.title,
      body: input.body ?? '',
      level: 0,
    });
  }
  if (r.isNew && opensIncident(input.severity)) {
    try {
      const incidentId = await openIncident(null, {
        title: input.title,
        severity: incidentSeverityFor(input.severity),
        summary: input.body ?? '',
        sourceAlertId: r.id,
      });
      await getAdminSupabase().from('alerts').update({ incident_id: incidentId }).eq('id', r.id);
    } catch (e) {
      log.error('incident could not be opened', { error: e });
    }
  }
  return r.id;
}

/** Called every few minutes: pages the next level for alerts nobody acknowledged. */
export async function processEscalations(): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_alert_escalate', {
    p_interval_seconds: ESCALATE_SECONDS,
  });
  if (error) throw new InternalError(error);
  const rows = z
    .array(
      z
        .object({
          id: z.string().uuid(),
          severity: z.enum(ALERT_SEVERITIES),
          title: z.string(),
          body: z.string(),
          level: z.number().int(),
        })
        .strip(),
    )
    .parse(data ?? []);
  for (const r of rows) {
    const ruleId = (
      await getAdminSupabase().from('alerts').select('rule_id').eq('id', r.id).maybeSingle()
    ).data?.rule_id;
    await dispatch({
      id: r.id,
      ruleId: typeof ruleId === 'string' ? ruleId : 'unknown',
      severity: r.severity,
      title: `Escalated: ${r.title}`,
      body: r.body,
      level: r.level,
    });
  }
  return rows.length;
}

export interface AlertsOverview {
  alerts: {
    id: string;
    ruleId: string;
    severity: string;
    title: string;
    status: string;
    occurrences: number;
    lastAt: string;
    level: number;
  }[];
  silences: { id: string; ruleId: string; reason: string; endsAt: string }[];
  channels: {
    id: string;
    name: string;
    kind: string;
    target: string;
    minSeverity: string;
    fromLevel: number;
    enabled: boolean;
  }[];
  roster: { id: string; name: string; email: string; level: number }[];
}

const maskUrl = (url: string): string => {
  try {
    return `${new URL(url).origin}/...`;
  } catch {
    return '...';
  }
};

export async function alertsOverview(): Promise<AlertsOverview> {
  const admin = getAdminSupabase();
  const [alerts, silences, channels, roster] = await Promise.all([
    admin
      .from('alerts')
      .select('*')
      .is('deleted_at', null)
      .order('last_at', { ascending: false })
      .limit(50),
    admin
      .from('alert_silences')
      .select('id, rule_id, reason, ends_at')
      .is('deleted_at', null)
      .gt('ends_at', new Date().toISOString()),
    admin.from('alert_channels').select('*').is('deleted_at', null).order('created_at'),
    admin.from('oncall_roster').select('*').is('deleted_at', null).order('level'),
  ]);
  for (const p of [alerts, silences, channels, roster])
    if (p.error) throw new InternalError(p.error);
  return {
    alerts: z
      .array(alertRow)
      .parse(alerts.data)
      .map((a) => ({
        id: a.id,
        ruleId: a.rule_id,
        severity: a.severity,
        title: a.title,
        status: a.status,
        occurrences: a.occurrences,
        lastAt: a.last_at,
        level: a.escalation_level,
      })),
    silences: (silences.data ?? []).map((s) => ({
      id: String(s.id),
      ruleId: String(s.rule_id),
      reason: String(s.reason),
      endsAt: String(s.ends_at),
    })),
    channels: z
      .array(channelRow)
      .parse(channels.data)
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        target: maskUrl(c.target),
        minSeverity: c.min_severity,
        fromLevel: c.from_level,
        enabled: c.enabled,
      })),
    roster: z
      .array(rosterRow)
      .parse(roster.data)
      .map((r) => ({ id: r.id, name: r.name, email: r.email, level: r.level })),
  };
}

async function softDelete(
  table: 'alert_silences' | 'alert_channels' | 'oncall_roster',
  id: string,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
}

export async function runAlertAction(actor: Actor, input: AlertAction): Promise<void> {
  const admin = getAdminSupabase();
  const audit = getService('audit');
  const record = (
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> =>
    audit.record({
      action,
      resourceType,
      resourceId,
      companyId: null,
      metadata: { by: actor.userId, ...metadata },
    });
  switch (input.action) {
    case 'acknowledge': {
      const { data, error } = await admin.rpc('kd_alert_ack', {
        p_id: input.id,
        p_user: actor.userId,
      });
      if (error) throw new InternalError(error);
      if (data !== true) throw new NotFoundError();
      return record('alert.acknowledged', 'alert', input.id);
    }
    case 'resolve': {
      const { data, error } = await admin.rpc('kd_alert_resolve', { p_id: input.id });
      if (error) throw new InternalError(error);
      if (data !== true) throw new NotFoundError();
      return record('alert.resolved', 'alert', input.id);
    }
    case 'create_silence': {
      const { data, error } = await admin
        .from('alert_silences')
        .insert({
          rule_id: input.ruleId,
          reason: input.reason,
          ends_at: new Date(Date.now() + input.hours * 3_600_000).toISOString(),
          created_by: actor.userId,
        })
        .select('id')
        .single();
      if (error) throw new InternalError(error);
      return record('alert.silence_created', 'alert_silence', String(data.id), {
        rule: input.ruleId,
        hours: input.hours,
      });
    }
    case 'delete_silence':
      await softDelete('alert_silences', input.id);
      return record('alert.silence_deleted', 'alert_silence', input.id);
    case 'create_channel': {
      validateOutboundUrl(input.target);
      let credential: EncryptedPayload | null = null;
      if (input.secret) {
        const encryption = tryGetService('encryption');
        if (!encryption)
          throw new ValidationError(
            'Credentials cannot be stored until the encryption service is installed.',
          );
        credential = await encryption.encrypt('pii', input.secret);
      }
      if (input.kind === 'pagerduty' && !credential)
        throw new ValidationError('PagerDuty needs the routing key as the token or key.');
      const { data, error } = await admin
        .from('alert_channels')
        .insert({
          name: input.name,
          kind: input.kind,
          target: input.target,
          credential,
          min_severity: input.minSeverity,
          from_level: input.fromLevel,
        })
        .select('id')
        .single();
      if (error) throw new InternalError(error);
      return record('alert.channel_created', 'alert_channel', String(data.id), {
        kind: input.kind,
      });
    }
    case 'delete_channel':
      await softDelete('alert_channels', input.id);
      return record('alert.channel_deleted', 'alert_channel', input.id);
    case 'test_channel': {
      const { data, error } = await admin
        .from('alert_channels')
        .select('*')
        .eq('id', input.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new InternalError(error);
      if (!data) throw new NotFoundError();
      try {
        await postToChannel(channelRow.parse(data), {
          id: input.id,
          ruleId: 'test',
          severity: 'low',
          title: 'Test alert',
          body: 'This is a test from KD SOLUTION IT.',
          level: 0,
        });
      } catch (e) {
        throw new ValidationError(e instanceof Error ? e.message : 'The test failed.');
      }
      return;
    }
    case 'add_oncall': {
      const { data, error } = await admin
        .from('oncall_roster')
        .insert({ name: input.name, email: input.email, level: input.level })
        .select('id')
        .single();
      if (error) throw new InternalError(error);
      return record('alert.oncall_added', 'oncall_roster', String(data.id), { level: input.level });
    }
    case 'remove_oncall':
      await softDelete('oncall_roster', input.id);
      return record('alert.oncall_removed', 'oncall_roster', input.id);
  }
}
