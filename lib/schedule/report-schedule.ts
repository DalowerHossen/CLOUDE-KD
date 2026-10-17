// path: lib/schedule/report-schedule.ts
// When a scheduled report runs next. Weekly schedules name a weekday (1 Monday to 7 Sunday); monthly schedules a day of
// the month from 1 to 28, so every month has that day. Pure; safe to import in the browser.
import { addDays } from '@/lib/invoice/terms';
import { toInt } from '@/lib/reports/numbers';

const isoWeekday = (day: string): number => {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
};

/** The first run date strictly after `after`. */
export function nextRun(
  frequency: 'weekly' | 'monthly',
  weekday: number | null,
  monthDay: number | null,
  after: string,
): string {
  if (frequency === 'weekly') {
    const target = weekday ?? 1;
    let d = addDays(after, 1);
    while (isoWeekday(d) !== target) d = addDays(d, 1);
    return d;
  }
  const target = monthDay ?? 1;
  const [y, m, day] = after.split('-');
  const year = toInt(y);
  const month = toInt(m);
  if (toInt(day) < target) return `${y}-${m}-${String(target).padStart(2, '0')}`;
  const nextMonthIndex = year * 12 + month; // month is 1-based, so this is the next month's 0-based index
  const ny = (nextMonthIndex - (nextMonthIndex % 12)) / 12;
  const nm = (nextMonthIndex % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
}
