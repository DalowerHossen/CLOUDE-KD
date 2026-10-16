// path: lib/alerting/policy.ts
// Pure alert policy: severities, incident mapping, channel selection and message payloads.
export const DEDUPE_SECONDS = 300;
export const ESCALATE_SECONDS = 900;
export const MAX_ESCALATION_LEVEL = 2;

export const ALERT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export const INCIDENT_SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export const CHANNEL_KINDS = ['slack', 'discord', 'webhook', 'pagerduty', 'sms_gateway'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

const RANK: Readonly<Record<AlertSeverity, number>> = { low: 1, medium: 2, high: 3, critical: 4 };

export function atLeast(severity: AlertSeverity, minimum: AlertSeverity): boolean {
  return RANK[severity] >= RANK[minimum];
}

export function incidentSeverityFor(severity: AlertSeverity): IncidentSeverity {
  return severity === 'critical'
    ? 'SEV1'
    : severity === 'high'
      ? 'SEV2'
      : severity === 'medium'
        ? 'SEV3'
        : 'SEV4';
}

/** Only a critical alert opens an incident on its own; the team opens the rest by hand. */
export function opensIncident(severity: AlertSeverity): boolean {
  return severity === 'critical';
}

export interface AlertView {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  level: number;
}

export interface ChannelView {
  id: string;
  kind: ChannelKind;
  target: string;
  minSeverity: AlertSeverity;
  fromLevel: number;
  enabled: boolean;
}

export function channelsFor<T extends ChannelView>(
  channels: readonly T[],
  severity: AlertSeverity,
  level: number,
): T[] {
  return channels.filter(
    (c) => c.enabled && atLeast(severity, c.minSeverity) && level >= c.fromLevel,
  );
}

export interface RosterEntry {
  email: string;
  level: number;
  startsAt: Date;
  endsAt: Date | null;
}

/** Who is on call for a level: entries whose window covers now. At level N the roster of levels 0 to N is paged. */
export function rosterFor(entries: readonly RosterEntry[], level: number, now: Date): string[] {
  const out = entries
    .filter((e) => e.level <= level && e.startsAt <= now && (e.endsAt === null || e.endsAt > now))
    .map((e) => e.email.toLowerCase());
  return [...new Set(out)];
}

const label = (a: AlertView): string =>
  `[${a.severity.toUpperCase()}${a.level > 0 ? ` L${a.level}` : ''}] ${a.title}`;

export function slackPayload(a: AlertView): Record<string, unknown> {
  return { text: `${label(a)}\n${a.body}`.trim() };
}
export function discordPayload(a: AlertView): Record<string, unknown> {
  return { content: `${label(a)}\n${a.body}`.trim().slice(0, 1900) };
}
export function webhookPayload(a: AlertView): Record<string, unknown> {
  return {
    id: a.id,
    rule: a.ruleId,
    severity: a.severity,
    title: a.title,
    body: a.body,
    level: a.level,
  };
}
export function pagerdutyPayload(a: AlertView, routingKey: string): Record<string, unknown> {
  return {
    routing_key: routingKey,
    event_action: 'trigger',
    dedup_key: a.id,
    payload: {
      summary: label(a).slice(0, 1024),
      source: 'kd-solution-it',
      severity:
        a.severity === 'low'
          ? 'info'
          : a.severity === 'medium'
            ? 'warning'
            : a.severity === 'high'
              ? 'error'
              : 'critical',
      custom_details: { rule: a.ruleId, body: a.body },
    },
  };
}
export function smsPayload(a: AlertView): Record<string, unknown> {
  return { message: label(a).slice(0, 300) };
}

export function payloadFor(
  kind: ChannelKind,
  a: AlertView,
  secret: string | null,
): Record<string, unknown> {
  switch (kind) {
    case 'slack':
      return slackPayload(a);
    case 'discord':
      return discordPayload(a);
    case 'pagerduty':
      return pagerdutyPayload(a, secret ?? '');
    case 'sms_gateway':
      return smsPayload(a);
    case 'webhook':
      return webhookPayload(a);
  }
}
