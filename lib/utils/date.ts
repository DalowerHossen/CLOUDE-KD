// path: lib/utils/date.ts
// UTC date helpers. All timestamps in the system are UTC; local time is only for display.

export function nowUtc(): Date {
  return new Date();
}

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/** Parses an ISO 8601 timestamp that carries an explicit UTC marker (Z) or offset. */
export function parseIsoTimestamp(text: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new RangeError('Timestamp must be ISO 8601 with a time zone marker.');
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid timestamp.');
  return date;
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return addSeconds(date, minutes * 60);
}

export function addHours(date: Date, hours: number): Date {
  return addSeconds(date, hours * 3600);
}

export function addDays(date: Date, days: number): Date {
  return addSeconds(date, days * 86400);
}

export function isExpired(expiresAt: Date, now: Date = nowUtc()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Calendar date text (YYYY-MM-DD) in UTC. */
export function toUtcDateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds calendar months in UTC and clamps the day (Jan 31 + 1 month = Feb 28 or 29). */
export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
