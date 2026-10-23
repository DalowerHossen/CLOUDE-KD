// path: lib/schedule/reminders.ts
// The reminder ladder: which step is due today, whether it is a good moment to send (quiet hours, business days), and
// which stage the e-mail speaks in. Pure; safe to import in the browser.
import { addDays, daysBetween } from '@/lib/invoice/terms';
import { toInt } from '@/lib/reports/numbers';

export const DEFAULT_STEPS: readonly number[] = [-3, 0, 7, 14, 30];
export const MAX_STEPS = 12;
/** A step that is more than this many days late is skipped, so turning reminders on does not flood old invoices. */
export const MAX_LAG_DAYS = 3;

export type ReminderStage = 'before' | 'due' | 'overdue' | 'final';

export function stageOf(offset: number): ReminderStage {
  if (offset < 0) return 'before';
  if (offset === 0) return 'due';
  return offset >= 30 ? 'final' : 'overdue';
}

export const STAGE_TEXT: Record<ReminderStage, string> = {
  before: 'is due soon',
  due: 'is due today',
  overdue: 'is overdue',
  final: 'needs your attention now',
};

export interface StepDecision {
  /** The step to send now, or null. */
  send: number | null;
  /** Earlier steps that were never sent and now will not be (to log as skipped). */
  skip: number[];
}

export function dueSteps(
  dueDate: string,
  today: string,
  steps: readonly number[],
  logged: ReadonlySet<string>,
): StepDecision {
  const open = [...new Set(steps)]
    .sort((a, b) => a - b)
    .filter((offset) => !logged.has(String(offset)) && addDays(dueDate, offset) <= today);
  if (open.length === 0) return { send: null, skip: [] };
  const latest = open[open.length - 1] as number;
  const lag = daysBetween(addDays(dueDate, latest), today);
  if (lag > MAX_LAG_DAYS) return { send: null, skip: open };
  return { send: latest, skip: open.slice(0, -1) };
}

/** True when the hour is inside the quiet window (which may cross midnight, e.g. 20 to 8). Equal hours mean no quiet time. */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Monday to Friday. */
export function isBusinessDay(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

/** The hour (0 to 23) in a time zone. */
export function localHour(now: Date, timeZone: string): number {
  try {
    const text = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    return toInt(text.slice(0, 2), now.getUTCHours());
  } catch {
    return now.getUTCHours();
  }
}

export function normalizeSteps(steps: readonly number[]): number[] {
  return [...new Set(steps)]
    .filter((n) => Number.isInteger(n) && n >= -30 && n <= 365)
    .sort((a, b) => a - b)
    .slice(0, MAX_STEPS);
}
