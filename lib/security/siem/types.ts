// path: lib/security/siem/types.ts
import { z } from 'zod';

export const SIEM_KINDS = [
  'splunk_hec',
  'elastic',
  'datadog',
  'syslog_http',
  'cef_http',
  'leef_http',
  'cloudwatch_gateway',
  'sentinel_gateway',
  'chronicle_gateway',
] as const;
export type SiemKind = (typeof SIEM_KINDS)[number];

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type SiemSeverity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Readonly<Record<SiemSeverity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** One security event in the shape every forwarder works from. Addresses are masked or hashed already. */
export interface NormalizedEvent {
  id: string;
  time: string;
  type: string;
  severity: SiemSeverity;
  source: string;
  companyId: string | null;
  actorId: string | null;
  ipMasked: string | null;
  ipHash: string | null;
  correlationId: string | null;
  details: Record<string, unknown>;
}

export const eventRowSchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string(),
    event_type: z.string(),
    severity: z.enum(SEVERITIES),
    source: z.string(),
    company_id: z.string().uuid().nullable(),
    actor_user_id: z.string().uuid().nullable(),
    ip_masked: z.string().nullable(),
    ip_hash: z.string().nullable(),
    correlation_id: z.string().nullable(),
    details: z.record(z.string(), z.unknown()).nullable(),
  })
  .strip();

export function normalizeEvent(row: z.infer<typeof eventRowSchema>): NormalizedEvent {
  return {
    id: row.id,
    time: new Date(row.created_at).toISOString(),
    type: row.event_type,
    severity: row.severity,
    source: row.source,
    companyId: row.company_id,
    actorId: row.actor_user_id,
    ipMasked: row.ip_masked,
    ipHash: row.ip_hash,
    correlationId: row.correlation_id,
    details: row.details ?? {},
  };
}
