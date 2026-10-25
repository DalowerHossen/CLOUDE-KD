// path: lib/payment/health-rules.ts
// The rules of the processor health check. Pure: no network and no database.
import { DEGRADED_AFTER_MS } from '@/config/processor-health';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

/** What one probe saw. `reachable` is false for a timeout, a refused call or a failed test. */
export interface ProbeSample {
  reachable: boolean;
  ms: number;
}

export function classify(sample: ProbeSample): Exclude<HealthStatus, 'unknown'> {
  if (!sample.reachable) return 'down';
  return sample.ms > DEGRADED_AFTER_MS ? 'degraded' : 'healthy';
}

/** An unauthenticated ping: below 500 is reachable, 429 is reachable but slow to answer. */
export function sampleFromHttp(status: number, ms: number): ProbeSample {
  return { reachable: status < 500, ms: status === 429 ? DEGRADED_AFTER_MS + 1 : ms };
}

/**
 * The failure counter after a check. Only "down" adds one; healthy and degraded reset it; "unknown" (the check could not run
 * or was not trusted) leaves it as it was, so a broken checker can never switch a processor off.
 */
export function nextFailureCount(previous: number, status: HealthStatus): number {
  if (status === 'down') return previous + 1;
  if (status === 'unknown') return previous;
  return 0;
}

export function shouldDisable(failures: number, allowed: number, enabled: boolean): boolean {
  return enabled && allowed > 0 && failures >= allowed;
}

/** A check is due when the processor was never checked or the interval (less a minute of slack) has passed. */
export function isDue(lastCheckedAt: string | null, now: Date, intervalMinutes: number): boolean {
  if (!lastCheckedAt) return true;
  const last = Date.parse(lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= (intervalMinutes - 1) * 60_000;
}

/**
 * Fail closed. Two or more processors "down" in the same run, all of them, points at the platform's own network and not at
 * the processors, so none of those results may count toward switching anything off.
 */
export function looksLikeOwnOutage(statuses: readonly HealthStatus[]): boolean {
  const checked = statuses.filter((s) => s !== 'unknown');
  return checked.length >= 2 && checked.every((s) => s === 'down');
}

/** Printable ASCII only and short, so a processor's error text can be stored and shown safely. */
export function safeHealthMessage(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 300);
}

/** The address of a configured ping: https, no user name, no fragment. */
export function isValidHealthUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.username === '' && url.password === '' && url.hash === ''
    );
  } catch {
    return false;
  }
}

export const AUTO_DISABLE_PREFIX = 'disabled automatically';
export function autoDisableReason(failures: number): string {
  return `${AUTO_DISABLE_PREFIX}: ${failures} failed health checks in a row`;
}
export function wasAutoDisabled(disabledReason: string | null): boolean {
  return disabledReason !== null && disabledReason.startsWith(AUTO_DISABLE_PREFIX);
}
