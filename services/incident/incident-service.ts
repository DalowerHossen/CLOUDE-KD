// path: services/incident/incident-service.ts
// Incident lifecycle (SEV1 to SEV4): detected, acknowledged, mitigating, resolved, closed. The timeline is append-only.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { INCIDENT_SEVERITIES } from '@/lib/alerting/policy';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export const incidentActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('open'),
      title: z.string().trim().min(3).max(200),
      severity: z.enum(INCIDENT_SEVERITIES),
      summary: z.string().trim().max(4000).default(''),
      impact: z.string().trim().max(4000).default(''),
      startedMinutesAgo: z.number().int().min(0).max(43200).default(0),
    })
    .strict(),
  z
    .object({
      action: z.literal('transition'),
      id: z.string().uuid(),
      status: z.enum(['acknowledged', 'mitigating', 'resolved', 'closed']),
      note: z.string().trim().max(1000).default(''),
    })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      id: z.string().uuid(),
      version: z.number().int().min(1),
      summary: z.string().trim().max(4000).optional(),
      impact: z.string().trim().max(4000).optional(),
      rootCause: z.string().trim().max(4000).optional(),
      postmortem: z.string().trim().max(20000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('note'),
      id: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type IncidentAction = z.infer<typeof incidentActionSchema>;

/** Template offered in the editor when a post-mortem is started. */
export const POSTMORTEM_TEMPLATE = [
  'Summary:',
  'Impact (who, how long):',
  'Timeline (UTC):',
  'Root cause:',
  'What went well:',
  'What went wrong:',
  'Actions (owner, due date):',
].join('\n');

const row = z
  .object({
    id: z.string().uuid(),
    number: z.number(),
    title: z.string(),
    severity: z.enum(INCIDENT_SEVERITIES),
    status: z.string(),
    started_at: z.string(),
    detected_at: z.string(),
    acknowledged_at: z.string().nullable(),
    resolved_at: z.string().nullable(),
    summary: z.string(),
    impact: z.string(),
    root_cause: z.string(),
    postmortem: z.string(),
    version: z.number().int(),
  })
  .strip();
const metrics = z
  .object({
    total: z.number(),
    open: z.number(),
    mttd_minutes: z.number().nullable(),
    mtta_minutes: z.number().nullable(),
    mttr_minutes: z.number().nullable(),
  })
  .strip();
const timelineRow = z
  .object({
    id: z.string().uuid(),
    incident_id: z.string().uuid(),
    kind: z.string(),
    body: z.string(),
    created_at: z.string(),
  })
  .strip();

export interface IncidentOverview {
  incidents: {
    id: string;
    number: number;
    title: string;
    severity: string;
    status: string;
    detectedAt: string;
    resolvedAt: string | null;
    summary: string;
    impact: string;
    rootCause: string;
    postmortem: string;
    version: number;
    timeline: { id: string; kind: string; body: string; at: string }[];
  }[];
  metrics: {
    total: number;
    open: number;
    mttd: number | null;
    mtta: number | null;
    mttr: number | null;
  };
}

export async function incidentOverview(): Promise<IncidentOverview> {
  const admin = getAdminSupabase();
  const [list, stats] = await Promise.all([
    admin
      .from('incidents')
      .select('*')
      .is('deleted_at', null)
      .order('detected_at', { ascending: false })
      .limit(30),
    admin.rpc('kd_incident_metrics', { p_days: 90 }),
  ]);
  if (list.error) throw new InternalError(list.error);
  if (stats.error) throw new InternalError(stats.error);
  const rows = z.array(row).parse(list.data);
  const ids = rows.map((r) => r.id);
  const events = ids.length
    ? await admin
        .from('incident_events')
        .select('id, incident_id, kind, body, created_at')
        .in('incident_id', ids)
        .order('created_at')
    : { data: [], error: null };
  if (events.error) throw new InternalError(events.error);
  const timeline = z.array(timelineRow).parse(events.data);
  const m = metrics.parse(stats.data);
  return {
    incidents: rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      severity: r.severity,
      status: r.status,
      detectedAt: r.detected_at,
      resolvedAt: r.resolved_at,
      summary: r.summary,
      impact: r.impact,
      rootCause: r.root_cause,
      postmortem: r.postmortem,
      version: r.version,
      timeline: timeline
        .filter((t) => t.incident_id === r.id)
        .map((t) => ({ id: t.id, kind: t.kind, body: t.body, at: t.created_at })),
    })),
    metrics: {
      total: m.total,
      open: m.open,
      mttd: m.mttd_minutes,
      mtta: m.mtta_minutes,
      mttr: m.mttr_minutes,
    },
  };
}

export async function openIncident(
  actorId: string | null,
  input: {
    title: string;
    severity: (typeof INCIDENT_SEVERITIES)[number];
    summary?: string;
    impact?: string;
    startedMinutesAgo?: number;
    sourceAlertId?: string;
  },
): Promise<string> {
  const admin = getAdminSupabase();
  const started = new Date(Date.now() - (input.startedMinutesAgo ?? 0) * 60_000).toISOString();
  const { data, error } = await admin
    .from('incidents')
    .insert({
      title: input.title,
      severity: input.severity,
      summary: input.summary ?? '',
      impact: input.impact ?? '',
      started_at: started,
      source_alert_id: input.sourceAlertId ?? null,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  const ev = await admin
    .from('incident_events')
    .insert({
      incident_id: id,
      kind: 'opened',
      actor_user_id: actorId,
      body: `${input.severity}: ${input.title}`.slice(0, 4000),
    });
  if (ev.error) throw new InternalError(ev.error);
  await getService('audit').record({
    action: 'incident.opened',
    resourceType: 'incident',
    resourceId: id,
    companyId: null,
    metadata: { severity: input.severity, auto: actorId === null },
  });
  return id;
}

export async function runIncidentAction(actor: Actor, input: IncidentAction): Promise<void> {
  const admin = getAdminSupabase();
  const audit = getService('audit');
  switch (input.action) {
    case 'open':
      await openIncident(actor.userId, input);
      return;
    case 'transition': {
      const { data, error } = await admin.rpc('kd_incident_transition', {
        p_id: input.id,
        p_status: input.status,
        p_actor: actor.userId,
        p_note: input.note,
      });
      if (error) {
        if (error.code === '22023')
          throw new ValidationError(
            error.message.includes('post-mortem')
              ? 'Write the post-mortem before closing a SEV1 or SEV2 incident.'
              : 'This status change is not allowed.',
          );
        throw new InternalError(error);
      }
      if (data !== true) throw new NotFoundError();
      await audit.record({
        action: 'incident.status',
        resourceType: 'incident',
        resourceId: input.id,
        companyId: null,
        metadata: { status: input.status },
      });
      return;
    }
    case 'update': {
      const patch: Record<string, string | number> = { version: input.version + 1 };
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.impact !== undefined) patch.impact = input.impact;
      if (input.rootCause !== undefined) patch.root_cause = input.rootCause;
      if (input.postmortem !== undefined) patch.postmortem = input.postmortem;
      const { data, error } = await admin
        .from('incidents')
        .update(patch)
        .eq('id', input.id)
        .eq('version', input.version)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0)
        throw new ValidationError(
          'The incident was changed by someone else. Reload and try again.',
        );
      await admin
        .from('incident_events')
        .insert({
          incident_id: input.id,
          kind: 'updated',
          actor_user_id: actor.userId,
          body: 'Details updated',
        });
      await audit.record({
        action: 'incident.updated',
        resourceType: 'incident',
        resourceId: input.id,
        companyId: null,
        metadata: {},
      });
      return;
    }
    case 'note': {
      const { error } = await admin
        .from('incident_events')
        .insert({
          incident_id: input.id,
          kind: 'note',
          actor_user_id: actor.userId,
          body: input.body,
        });
      if (error) {
        if (error.code === '23503') throw new NotFoundError();
        throw new InternalError(error);
      }
      return;
    }
  }
}
