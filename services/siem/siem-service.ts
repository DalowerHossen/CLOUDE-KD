// path: services/siem/siem-service.ts
// SIEM: forwards security events to external destinations, correlates events into findings and matches indicators.
// Credentials are encrypted with the encryption service (purpose "pii"); without that service they cannot be saved.
import 'server-only';
import { z } from 'zod';
import { getService, tryGetService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { authHeaders, renderBatch } from '@/lib/security/siem/formats';
import { CORRELATION_RULES, IOC_WINDOW_MINUTES } from '@/lib/security/siem/rules';
import {
  SEVERITIES,
  SIEM_KINDS,
  eventRowSchema,
  normalizeEvent,
  type SiemSeverity,
} from '@/lib/security/siem/types';
import { safeHttpsRequest, validateOutboundUrl } from '@/lib/security/ssrf';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';

const log = createLogger({ component: 'siem' });
const BATCH = 200;
const BATCHES_PER_RUN = 5;

export const siemActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_destination'),
      name: z.string().trim().min(2).max(80),
      kind: z.enum(SIEM_KINDS),
      endpoint: z.string().trim().url().max(500),
      secret: z.string().trim().min(8).max(500).optional(),
      minSeverity: z.enum(SEVERITIES).default('low'),
    })
    .strict(),
  z.object({ action: z.literal('delete_destination'), id: z.string().uuid() }).strict(),
  z
    .object({ action: z.literal('set_enabled'), id: z.string().uuid(), enabled: z.boolean() })
    .strict(),
  z.object({ action: z.literal('test_destination'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('add_ioc'),
      iocType: z.enum(['ip_hash', 'user_agent_hash', 'email_hash']),
      value: z.string().regex(/^[0-9a-f]{64}$/),
      source: z.string().trim().min(2).max(80),
      severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
      days: z.number().int().min(1).max(3650).nullable().default(90),
    })
    .strict(),
  z.object({ action: z.literal('remove_ioc'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('finding_status'),
      id: z.string().uuid(),
      status: z.enum(['acknowledged', 'closed']),
    })
    .strict(),
]);
export type SiemAction = z.infer<typeof siemActionSchema>;

const encryptedSchema = z
  .object({
    ciphertext: z.string(),
    iv: z.string(),
    tag: z.string(),
    keyVersion: z.number().int(),
  })
  .strict();

const destinationRow = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: z.enum(SIEM_KINDS),
    endpoint: z.string(),
    credential: z.unknown().nullable(),
    enabled: z.boolean(),
    min_severity: z.enum(SEVERITIES),
    cursor_id: z.string().uuid().nullable(),
    last_success_at: z.string().nullable(),
    last_error: z.string().nullable(),
    failures: z.number().int(),
  })
  .strip();
type DestinationRow = z.infer<typeof destinationRow>;

export interface SiemOverview {
  destinations: {
    id: string;
    name: string;
    kind: string;
    endpoint: string;
    enabled: boolean;
    minSeverity: string;
    hasCredential: boolean;
    lastSuccessAt: string | null;
    lastError: string | null;
    failures: number;
  }[];
  iocs: {
    id: string;
    type: string;
    valueShort: string;
    source: string;
    severity: string;
    expiresAt: string | null;
  }[];
  findings: {
    id: string;
    ruleId: string;
    severity: string;
    subject: string;
    count: number;
    lastAt: string;
    status: string;
  }[];
  rules: { id: string; title: string; windowMinutes: number; threshold: number }[];
}

export async function siemOverview(): Promise<SiemOverview> {
  const admin = getAdminSupabase();
  const [dest, iocs, findings] = await Promise.all([
    admin
      .from('siem_destinations')
      .select('*')
      .is('deleted_at', null)
      .order('created_at')
      .limit(50),
    admin
      .from('siem_iocs')
      .select('id, ioc_type, value, source, severity, expires_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('siem_findings')
      .select('id, rule_id, severity, subject_ref, event_count, last_event_at, status')
      .is('deleted_at', null)
      .neq('status', 'closed')
      .order('last_event_at', { ascending: false })
      .limit(100),
  ]);
  for (const part of [dest, iocs, findings]) if (part.error) throw new InternalError(part.error);
  return {
    destinations: z
      .array(destinationRow)
      .parse(dest.data)
      .map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        endpoint: d.endpoint,
        enabled: d.enabled,
        minSeverity: d.min_severity,
        hasCredential: d.credential !== null,
        lastSuccessAt: d.last_success_at,
        lastError: d.last_error,
        failures: d.failures,
      })),
    iocs: (iocs.data ?? []).map((r) => ({
      id: String(r.id),
      type: String(r.ioc_type),
      valueShort: `${String(r.value).slice(0, 12)}...`,
      source: String(r.source),
      severity: String(r.severity),
      expiresAt: r.expires_at ? String(r.expires_at) : null,
    })),
    findings: (findings.data ?? []).map((r) => ({
      id: String(r.id),
      ruleId: String(r.rule_id),
      severity: String(r.severity),
      subject: `${String(r.subject_ref).slice(0, 12)}...`,
      count: Number(r.event_count),
      lastAt: String(r.last_event_at),
      status: String(r.status),
    })),
    rules: CORRELATION_RULES.map((r) => ({
      id: r.id,
      title: r.title,
      windowMinutes: r.windowMinutes,
      threshold: r.threshold,
    })),
  };
}

async function readSecret(row: DestinationRow): Promise<string | null> {
  if (row.credential === null) return null;
  const encryption = tryGetService('encryption');
  if (!encryption) throw new InternalError('The encryption service is not available.');
  const payload: EncryptedPayload = encryptedSchema.parse(row.credential);
  return new TextDecoder().decode(await encryption.decrypt('pii', payload));
}

async function send(
  row: DestinationRow,
  events: ReturnType<typeof normalizeEvent>[],
): Promise<void> {
  const rendered = renderBatch(row.kind, events);
  const secret = await readSecret(row);
  const response = await safeHttpsRequest(row.endpoint, {
    method: 'POST',
    headers: { 'content-type': rendered.contentType, ...authHeaders(row.kind, secret) },
    body: rendered.body,
    maxBytes: 64 * 1024,
    timeoutMs: 10_000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The destination answered with status ${response.status}.`);
  }
}

async function loadDestination(id: string): Promise<DestinationRow> {
  const { data, error } = await getAdminSupabase()
    .from('siem_destinations')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return destinationRow.parse(data);
}

/** Forwards new events to every enabled destination. A failing destination never blocks the others. */
export async function forwardPending(): Promise<{ sent: number; failed: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('siem_destinations')
    .select('*')
    .eq('enabled', true)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  let sent = 0;
  let failed = 0;
  for (const row of z.array(destinationRow).parse(data)) {
    try {
      for (let i = 0; i < BATCHES_PER_RUN; i++) {
        const current = i === 0 ? row : await loadDestination(row.id);
        const page = await admin.rpc('kd_siem_fetch', {
          p_after: current.cursor_id,
          p_min_severity: row.min_severity,
          p_limit: BATCH,
        });
        if (page.error) throw new InternalError(page.error);
        const events = z
          .array(eventRowSchema)
          .parse(page.data ?? [])
          .map(normalizeEvent);
        if (events.length === 0) break;
        await send(row, events);
        const last = events[events.length - 1];
        await admin.rpc('kd_siem_delivery_result', {
          p_destination: row.id,
          p_last_id: last?.id ?? null,
          p_error: null,
        });
        sent += events.length;
        if (events.length < BATCH) break;
      }
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : 'Delivery failed.';
      log.warn('siem delivery failed', { destination: row.id, message });
      await admin.rpc('kd_siem_delivery_result', {
        p_destination: row.id,
        p_last_id: null,
        p_error: message,
      });
    }
  }
  return { sent, failed };
}

export type FindingListener = (finding: {
  ruleId: string;
  severity: SiemSeverity;
  subject: string;
  count: number;
}) => Promise<void>;
const LISTENERS_KEY = Symbol.for('kd.solution.it.siem.listeners');
function listeners(): FindingListener[] {
  const holder = globalThis as unknown as Record<symbol, FindingListener[] | undefined>;
  const existing = holder[LISTENERS_KEY];
  if (existing) return existing;
  const created: FindingListener[] = [];
  holder[LISTENERS_KEY] = created;
  return created;
}
/** The alert engine (04.11) registers here to hear about new findings. */
export function onSiemFinding(listener: FindingListener): void {
  if (!listeners().includes(listener)) listeners().push(listener);
}

const correlateRow = z
  .object({
    subject_ref: z.string(),
    event_count: z.number().int(),
    first_at: z.string(),
    last_at: z.string(),
    event_ids: z.array(z.string()),
  })
  .strip();
const iocHitRow = correlateRow.extend({
  ioc_id: z.string().uuid(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

/** Runs every correlation rule and the indicator match. Returns the number of new findings. */
export async function runCorrelation(): Promise<number> {
  const admin = getAdminSupabase();
  let created = 0;
  const open = async (
    ruleId: string,
    severity: SiemSeverity,
    row: z.infer<typeof correlateRow>,
    extra: Record<string, unknown>,
  ): Promise<void> => {
    const { data, error } = await admin.rpc('kd_siem_open_finding', {
      p_rule: ruleId,
      p_severity: severity,
      p_subject: row.subject_ref,
      p_count: row.event_count,
      p_first: row.first_at,
      p_last: row.last_at,
      p_evidence: { event_ids: row.event_ids, ...extra },
      p_company: null,
    });
    if (error) throw new InternalError(error);
    if (data === true) {
      created += 1;
      for (const listener of listeners()) {
        await listener({
          ruleId,
          severity,
          subject: row.subject_ref,
          count: row.event_count,
        }).catch((e: unknown) => log.error('finding listener failed', { error: e }));
      }
    }
  };
  for (const rule of CORRELATION_RULES) {
    const { data, error } = await admin.rpc('kd_siem_correlate', {
      p_types: [...rule.types],
      p_group_by: rule.groupBy,
      p_window_minutes: rule.windowMinutes,
      p_threshold: rule.threshold,
    });
    if (error) throw new InternalError(error);
    for (const row of z.array(correlateRow).parse(data ?? [])) {
      await open(rule.id, rule.severity, row, { rule: rule.title });
    }
  }
  const hits = await admin.rpc('kd_siem_ioc_hits', { p_window_minutes: IOC_WINDOW_MINUTES });
  if (hits.error) throw new InternalError(hits.error);
  for (const row of z.array(iocHitRow).parse(hits.data ?? [])) {
    await open('ioc.match', row.severity, row, { ioc_id: row.ioc_id });
  }
  return created;
}

export async function runSiemAction(actor: Actor, input: SiemAction): Promise<void> {
  const admin = getAdminSupabase();
  const audit = getService('audit');
  switch (input.action) {
    case 'create_destination': {
      validateOutboundUrl(input.endpoint);
      let credential: EncryptedPayload | null = null;
      if (input.secret) {
        const encryption = tryGetService('encryption');
        if (!encryption) {
          throw new ValidationError(
            'Credentials cannot be stored until the encryption service is installed.',
          );
        }
        credential = await encryption.encrypt('pii', input.secret);
      }
      const newest = await admin
        .from('security_events')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await admin
        .from('siem_destinations')
        .insert({
          name: input.name,
          kind: input.kind,
          endpoint: input.endpoint,
          credential,
          min_severity: input.minSeverity,
          cursor_id: newest.data ? String(newest.data.id) : null,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505')
          throw new ValidationError('A destination with this name exists.');
        throw new InternalError(error);
      }
      await audit.record({
        action: 'siem.destination_created',
        resourceType: 'siem_destination',
        resourceId: String(data.id),
        companyId: null,
        metadata: { kind: input.kind, by: actor.userId },
      });
      return;
    }
    case 'delete_destination':
    case 'set_enabled': {
      const patch =
        input.action === 'delete_destination'
          ? { deleted_at: new Date().toISOString() }
          : { enabled: input.enabled };
      const { data, error } = await admin
        .from('siem_destinations')
        .update(patch)
        .eq('id', input.id)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await audit.record({
        action:
          input.action === 'delete_destination'
            ? 'siem.destination_deleted'
            : 'siem.destination_toggled',
        resourceType: 'siem_destination',
        resourceId: input.id,
        companyId: null,
        metadata: { by: actor.userId },
      });
      return;
    }
    case 'test_destination': {
      const row = await loadDestination(input.id);
      const sample = normalizeEvent(
        eventRowSchema.parse({
          id: '00000000-0000-7000-8000-000000000000',
          created_at: new Date().toISOString(),
          event_type: 'other',
          severity: 'info',
          source: 'siem-test',
          company_id: null,
          actor_user_id: null,
          ip_masked: null,
          ip_hash: null,
          correlation_id: null,
          details: { test: true },
        }),
      );
      try {
        await send(row, [sample]);
      } catch (e) {
        throw new ValidationError(e instanceof Error ? e.message : 'The test failed.');
      }
      return;
    }
    case 'add_ioc': {
      const { data, error } = await admin
        .from('siem_iocs')
        .insert({
          ioc_type: input.iocType,
          value: input.value,
          source: input.source,
          severity: input.severity,
          expires_at: input.days
            ? new Date(Date.now() + input.days * 86_400_000).toISOString()
            : null,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') throw new ValidationError('This indicator already exists.');
        throw new InternalError(error);
      }
      await audit.record({
        action: 'siem.ioc_added',
        resourceType: 'siem_ioc',
        resourceId: String(data.id),
        companyId: null,
        metadata: { type: input.iocType, by: actor.userId },
      });
      return;
    }
    case 'remove_ioc': {
      const { data, error } = await admin
        .from('siem_iocs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await audit.record({
        action: 'siem.ioc_removed',
        resourceType: 'siem_ioc',
        resourceId: input.id,
        companyId: null,
        metadata: { by: actor.userId },
      });
      return;
    }
    case 'finding_status': {
      const { data, error } = await admin
        .from('siem_findings')
        .update({ status: input.status })
        .eq('id', input.id)
        .is('deleted_at', null)
        .neq('status', 'closed')
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await audit.record({
        action: 'siem.finding_updated',
        resourceType: 'siem_finding',
        resourceId: input.id,
        companyId: null,
        metadata: { status: input.status, by: actor.userId },
      });
      return;
    }
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new ForbiddenError();
  return actor;
}
