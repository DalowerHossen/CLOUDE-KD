// path: lib/security/siem/formats.ts
// Pure renderers: one normalized event list in, one request body out. No network access here.
// Auth headers are an owner-confirmed convention per product (see DECISIONS D13).
import { stripHeaderInjection } from '@/lib/security/http-safety';
import type { NormalizedEvent, SiemKind, SiemSeverity } from './types';

const VENDOR = 'KD SOLUTION IT';
const PRODUCT = 'Platform';
const VERSION = '1.0';
const HOST = 'kd-solution-it';

const SYSLOG_SEVERITY: Readonly<Record<SiemSeverity, number>> = {
  critical: 2,
  high: 3,
  medium: 4,
  low: 5,
  info: 6,
};
const CEF_SEVERITY: Readonly<Record<SiemSeverity, number>> = {
  info: 1,
  low: 3,
  medium: 5,
  high: 8,
  critical: 10,
};

const oneLine = (value: string): string => value.replace(/[\r\n\t]+/g, ' ');
const flat = (details: Record<string, unknown>): string => oneLine(JSON.stringify(details));

function fields(e: NormalizedEvent): [string, string][] {
  const out: [string, string][] = [
    ['eventId', e.id],
    ['src', e.ipMasked ?? ''],
    ['srcHash', e.ipHash ?? ''],
    ['actor', e.actorId ?? ''],
    ['company', e.companyId ?? ''],
    ['source', e.source],
    ['correlation', e.correlationId ?? ''],
    ['details', flat(e.details)],
  ];
  return out.filter(([, v]) => v !== '');
}

/** RFC 5424 line, facility 4 (security/authorization). */
export function toSyslog(e: NormalizedEvent): string {
  const pri = 4 * 8 + SYSLOG_SEVERITY[e.severity];
  const sd = `[kd@32473 eventId="${e.id}" severity="${e.severity}"]`;
  return `<${pri}>1 ${e.time} ${HOST} kd-security - ${e.type} ${sd} ${oneLine(e.type)} ${flat(e.details)}`;
}

const cefHeader = (v: string): string => oneLine(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
const cefValue = (v: string): string => oneLine(v).replace(/\\/g, '\\\\').replace(/=/g, '\\=');

export function toCef(e: NormalizedEvent): string {
  const ext = [`rt=${Date.parse(e.time)}`, ...fields(e).map(([k, v]) => `${k}=${cefValue(v)}`)];
  return `CEF:0|${cefHeader(VENDOR)}|${PRODUCT}|${VERSION}|${cefHeader(e.type)}|${cefHeader(e.type)}|${CEF_SEVERITY[e.severity]}|${ext.join(' ')}`;
}

const leefValue = (v: string): string => oneLine(v).replace(/\^/g, ' ');

/** LEEF 2.0 with "^" as the field delimiter. */
export function toLeef(e: NormalizedEvent): string {
  const attrs = [
    `devTime=${e.time}`,
    `sev=${CEF_SEVERITY[e.severity]}`,
    ...fields(e).map(([k, v]) => `${k}=${leefValue(v)}`),
  ];
  return `LEEF:2.0|${VENDOR}|${PRODUCT}|${VERSION}|${oneLine(e.type)}|^|${attrs.join('^')}`;
}

function body(e: NormalizedEvent): Record<string, unknown> {
  return {
    id: e.id,
    type: e.type,
    severity: e.severity,
    source: e.source,
    company_id: e.companyId,
    actor_id: e.actorId,
    ip_masked: e.ipMasked,
    ip_hash: e.ipHash,
    correlation_id: e.correlationId,
    details: e.details,
  };
}

export interface RenderedBatch {
  body: string;
  contentType: string;
}

export function renderBatch(kind: SiemKind, events: readonly NormalizedEvent[]): RenderedBatch {
  switch (kind) {
    case 'splunk_hec':
      return {
        contentType: 'application/json',
        body: events
          .map((e) =>
            JSON.stringify({
              time: Date.parse(e.time) / 1000,
              host: HOST,
              source: 'kd-security',
              sourcetype: '_json',
              event: body(e),
            }),
          )
          .join('\n'),
      };
    case 'elastic':
      return {
        contentType: 'application/x-ndjson',
        body:
          events
            .map(
              (e) =>
                `${JSON.stringify({ create: { _id: e.id } })}\n${JSON.stringify({
                  '@timestamp': e.time,
                  event: {
                    kind: 'event',
                    category: ['intrusion_detection'],
                    action: e.type,
                    severity: CEF_SEVERITY[e.severity],
                  },
                  source: { ip: e.ipMasked },
                  user: { id: e.actorId },
                  kd: body(e),
                })}`,
            )
            .join('\n') + '\n',
      };
    case 'datadog':
      return {
        contentType: 'application/json',
        body: JSON.stringify(
          events.map((e) => ({
            ddsource: 'kd-solution-it',
            ddtags: `type:${e.type},severity:${e.severity}`,
            hostname: HOST,
            service: 'security',
            status:
              e.severity === 'info'
                ? 'info'
                : e.severity === 'critical'
                  ? 'critical'
                  : e.severity === 'high'
                    ? 'error'
                    : 'warn',
            message: JSON.stringify(body(e)),
          })),
        ),
      };
    case 'syslog_http':
      return { contentType: 'text/plain', body: events.map(toSyslog).join('\n') };
    case 'cef_http':
      return { contentType: 'text/plain', body: events.map(toCef).join('\n') };
    case 'leef_http':
      return { contentType: 'text/plain', body: events.map(toLeef).join('\n') };
    case 'cloudwatch_gateway':
    case 'sentinel_gateway':
    case 'chronicle_gateway':
      return {
        contentType: 'application/json',
        body: JSON.stringify(events.map((e) => ({ timestamp: Date.parse(e.time), ...body(e) }))),
      };
  }
}

/** Authorization header for a destination; the secret is a single token or key. */
export function authHeaders(kind: SiemKind, secret: string | null): Record<string, string> {
  if (!secret) return {};
  const s = stripHeaderInjection(secret);
  switch (kind) {
    case 'splunk_hec':
      return { authorization: `Splunk ${s}` };
    case 'elastic':
      return { authorization: `ApiKey ${s}` };
    case 'datadog':
      return { 'dd-api-key': s };
    default:
      return { authorization: `Bearer ${s}` };
  }
}
