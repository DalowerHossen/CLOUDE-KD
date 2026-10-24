// path: lib/support/status.ts
// Public status: what is shown about incidents, and how the overall state and the 90-day bars are worked out.
// Pure functions. Only the title, severity label, state and times of an incident are ever shown; free text of
// incidents (summary, causes, notes) stays internal.

export type Level = 'operational' | 'degraded' | 'outage';

export interface PublicIncident {
  number: number;
  title: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
  state: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string;
  resolvedAt: string | null;
}

/** Public wording of the internal status. */
export function publicState(status: string): PublicIncident['state'] {
  if (status === 'resolved' || status === 'closed') return 'resolved';
  if (status === 'mitigating') return 'monitoring';
  if (status === 'acknowledged') return 'identified';
  return 'investigating';
}

export const levelOf = (severity: string): Level =>
  severity === 'SEV1' || severity === 'SEV2'
    ? 'outage'
    : severity === 'SEV3'
      ? 'degraded'
      : 'operational';

const RANK: Record<Level, number> = { operational: 0, degraded: 1, outage: 2 };
export const worst = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);

/** Overall state: the worst level among incidents that are still open, or "outage" when the database is down. */
export function overallLevel(open: readonly PublicIncident[], databaseOk: boolean): Level {
  let level: Level = databaseOk ? 'operational' : 'outage';
  for (const i of open) level = worst(level, levelOf(i.severity));
  return level;
}

export interface DayBar {
  day: string;
  level: Level;
}

const DAY = 86_400_000;

/** One bar per UTC day for the last `days` days, colored by the worst incident that touched the day. */
export function dayBars(
  incidents: readonly PublicIncident[],
  days: number,
  now: Date = new Date(),
): DayBar[] {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const bars: DayBar[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const start = todayStart - i * DAY;
    const end = start + DAY;
    let level: Level = 'operational';
    for (const inc of incidents) {
      const from = Date.parse(inc.startedAt);
      const to = inc.resolvedAt ? Date.parse(inc.resolvedAt) : now.getTime();
      if (from < end && to >= start) level = worst(level, levelOf(inc.severity));
    }
    bars.push({ day: new Date(start).toISOString().slice(0, 10), level });
  }
  return bars;
}

/**
 * Share of the period without a major outage (SEV1 or SEV2), from incident times. It is an estimate based on
 * recorded incidents, not a measurement of every request.
 */
export function uptimePercent(
  incidents: readonly PublicIncident[],
  days: number,
  now: Date = new Date(),
): string {
  const end = now.getTime();
  const start = end - days * DAY;
  const spans = incidents
    .filter((i) => levelOf(i.severity) === 'outage')
    .map(
      (i) =>
        [
          Math.max(start, Date.parse(i.startedAt)),
          Math.min(end, i.resolvedAt ? Date.parse(i.resolvedAt) : end),
        ] as const,
    )
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let down = 0;
  let cursor = start;
  for (const [a, b] of spans) {
    const from = Math.max(a, cursor);
    if (b > from) {
      down += b - from;
      cursor = b;
    }
  }
  const pct = (1 - down / (end - start)) * 100;
  return pct.toFixed(2);
}
