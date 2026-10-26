// path: netlify/functions/cron-tick.mts
// The scheduler of the platform. Netlify runs this function every 5 minutes (UTC); it calls POST /api/cron/<job> with the
// CRON_SECRET for every job whose schedule (cron/jobs/*.ts, copied into netlify/cron-jobs.generated.mts) matched a minute since
// the last run. Waking once a minute used up the plan's function allowance (the site answered 503 usage_exceeded).
// The application then runs the job under its own leader lock, so a job never runs twice at once.
import { CRON_JOBS } from '../cron-jobs.generated.mjs';

// One field of a five-field cron line: a star, a number, a list, a range, or a step (for example every 10 or 10-30 every 5).
export function fieldMatches(spec: string, value: number, min: number, max: number): boolean {
  for (const part of spec.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : +stepText;
    if (!Number.isInteger(step) || step < 1 || range === undefined) continue;
    let from = min;
    let to = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      from = +(a ?? '');
      to = b === undefined ? (stepText === undefined ? from : max) : +b;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max) continue;
    if (value >= from && value <= to && (value - from) % step === 0) return true;
  }
  return false;
}

/** True when the five-field schedule matches this minute (UTC). Day of week 7 counts as Sunday. */
export function scheduleMatches(schedule: string, at: Date): boolean {
  const f = schedule.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const dow = at.getUTCDay();
  return (
    fieldMatches(f[0] ?? '', at.getUTCMinutes(), 0, 59) &&
    fieldMatches(f[1] ?? '', at.getUTCHours(), 0, 23) &&
    fieldMatches(f[2] ?? '', at.getUTCDate(), 1, 31) &&
    fieldMatches(f[3] ?? '', at.getUTCMonth() + 1, 1, 12) &&
    (fieldMatches(f[4] ?? '', dow, 0, 7) || (dow === 0 && fieldMatches(f[4] ?? '', 7, 0, 7)))
  );
}

export function dueJobs(at: Date): string[] {
  return CRON_JOBS.filter((j) => scheduleMatches(j.schedule, at)).map((j) => j.name);
}

/** The scheduler wakes every few minutes, so a job is due when its line matched any minute since the last wake. Each job once. */
export const TICK_MINUTES = 5;
export function dueJobsSince(at: Date, minutes: number = TICK_MINUTES): string[] {
  const names = new Set<string>();
  for (let back = 0; back < minutes; back += 1)
    for (const name of dueJobs(new Date(at.getTime() - back * 60_000))) names.add(name);
  return [...names];
}

const log = (text: string): void => void process.stdout.write(`${text}\n`);

export default async function handler(): Promise<Response> {
  const base = process.env['URL'];
  const secret = process.env['CRON_SECRET'];
  if (!base || !secret) {
    log('cron-tick: URL or CRON_SECRET is not set; nothing was called');
    return new Response('not configured', { status: 500 });
  }
  const names = dueJobsSince(new Date());
  const results = await Promise.allSettled(
    names.map(async (name) => {
      const response = await fetch(`${base}/api/cron/${name}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) log(`cron-tick: ${name} answered HTTP ${response.status}`);
      return response.status;
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  log(`cron-tick: called ${names.length} job(s), ${failed} did not answer in time`);
  return new Response(JSON.stringify({ called: names.length, failed }), {
    headers: { 'content-type': 'application/json' },
  });
}

/** Every 5 minutes. Netlify runs scheduled functions only for the published (production) deploy. */
export const config = { schedule: '*/5 * * * *' };
