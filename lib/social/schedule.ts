// path: lib/social/schedule.ts
// Social schedules as pure functions: the inputs, time zone arithmetic (a local day and time to a moment in UTC), the posting slots of
// a recurring schedule, the next evergreen post and its text variant. No database or network here.
import { z } from 'zod';
import { MAX_SLOTS_PER_SCHEDULE_RUN } from '@/config/s16-social';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const uuid = z.string().uuid();
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v), { message: 'Use an https address.' });

/** True for a time zone name that this runtime knows (for example Asia/Dhaka). */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const zone = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(isTimeZone, { message: 'Use a time zone name such as Asia/Dhaka or UTC.' });
const timeOfDay = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use a time like 09:30.');
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((v) => new Set(v).size === v.length, { message: 'Each day once.' });

/* ---------- inputs ---------- */

export const settingsInput = z
  .object({
    approvalRequired: z.boolean(),
    approvalSlaHours: z.number().int().min(1).max(168).nullable().default(null),
    trackLinks: z.boolean(),
  })
  .strict();

export const scheduleInput = z
  .object({
    accountId: uuid,
    name: plain(1, 100),
    body: plain(0, 5000).default(''),
    linkUrl: httpsUrl.nullable().default(null),
    imageUrl: httpsUrl.nullable().default(null),
    hashtagGroupId: uuid.nullable().default(null),
    daysOfWeek: weekdays,
    timeOfDay,
    timezone: zone,
  })
  .strict()
  .refine((v) => v.body !== '' || v.imageUrl !== null, {
    message: 'Write some text or add an image.',
    path: ['body'],
  });

export const scheduleUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 100).optional(),
    body: plain(0, 5000).optional(),
    linkUrl: httpsUrl.nullable().optional(),
    imageUrl: httpsUrl.nullable().optional(),
    hashtagGroupId: uuid.nullable().optional(),
    daysOfWeek: weekdays.optional(),
    timeOfDay: timeOfDay.optional(),
    timezone: zone.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const ruleInput = z
  .object({
    name: plain(1, 100),
    triggerKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_.-]{1,40}$/, 'Use lower case letters, digits, . _ -'),
    accountIds: z.array(uuid).min(1).max(10),
    bodyTemplate: plain(1, 5000),
    hashtagGroupId: uuid.nullable().default(null),
    mode: z.enum(['draft', 'publish']).default('draft'),
  })
  .strict();

export const ruleUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 100).optional(),
    accountIds: z.array(uuid).min(1).max(10).optional(),
    bodyTemplate: plain(1, 5000).optional(),
    hashtagGroupId: uuid.nullable().optional(),
    mode: z.enum(['draft', 'publish']).optional(),
    enabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

export const fireInput = z
  .object({
    triggerKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_.-]{1,40}$/),
    sourceKey: z.string().trim().min(1).max(200),
    title: plain(0, 300).default(''),
    url: httpsUrl.nullable().default(null),
    summary: plain(0, 1000).default(''),
    imageUrl: httpsUrl.nullable().default(null),
  })
  .strict();

export const evergreenItemInput = z
  .object({
    accountId: uuid,
    name: plain(1, 100),
    variants: z.array(plain(1, 2000)).min(1).max(6),
    linkUrl: httpsUrl.nullable().default(null),
    imageUrl: httpsUrl.nullable().default(null),
    priority: z.number().int().min(1).max(5).default(3),
  })
  .strict();

export const evergreenItemUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 100).optional(),
    variants: z.array(plain(1, 2000)).min(1).max(6).optional(),
    linkUrl: httpsUrl.nullable().optional(),
    imageUrl: httpsUrl.nullable().optional(),
    priority: z.number().int().min(1).max(5).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const evergreenPlanInput = z
  .object({
    accountId: uuid,
    everyDays: z.number().int().min(1).max(90),
    timeOfDay,
    timezone: zone,
    minItems: z.number().int().min(0).max(100).default(5),
    enabled: z.boolean().default(true),
  })
  .strict();

export const decisionInput = z
  .object({ decision: z.enum(['approve', 'reject']), reason: plain(0, 300).default('') })
  .strict()
  .refine((v) => v.decision === 'approve' || v.reason.length >= 3, {
    message: 'Give a reason for the refusal.',
    path: ['reason'],
  });

/* ---------- time zones ---------- */

const PARTS = (zoneName: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zoneName,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

interface LocalParts {
  day: string;
  hour: number;
  minute: number;
  second: number;
}

function localParts(at: Date, zoneName: string): LocalParts {
  const map = new Map<string, string>(
    PARTS(zoneName)
      .formatToParts(at)
      .map((p): [string, string] => [p.type, p.value]),
  );
  const get = (k: string): string => map.get(k) ?? '0';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number.parseInt(get('hour'), 10),
    minute: Number.parseInt(get('minute'), 10),
    second: Number.parseInt(get('second'), 10),
  };
}

/** The calendar day (YYYY-MM-DD) of a moment in a time zone. */
export const localDay = (at: Date, zoneName: string): string => localParts(at, zoneName).day;

/** The hour of day (0 to 23) of a moment in a time zone. */
export const localHour = (at: Date, zoneName: string): number => localParts(at, zoneName).hour;

/** The day of week (0 Sunday to 6 Saturday) of a calendar day text. */
export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The day after a calendar day text, `n` days later. */
export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function offsetMs(at: Date, zoneName: string): number {
  const p = localParts(at, zoneName);
  const asUtc =
    Date.parse(`${p.day}T00:00:00Z`) + ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const whole = at.getTime() - (at.getTime() % 1000);
  return asUtc - whole;
}

/** The moment (UTC) at which the clock in the time zone shows the day and time. A time that does not exist (clock change) moves forward. */
export function zonedToUtc(day: string, time: string, zoneName: string): Date {
  const naive = Date.parse(`${day}T${time}:00Z`);
  let guess = naive - offsetMs(new Date(naive), zoneName);
  guess = naive - offsetMs(new Date(guess), zoneName);
  return new Date(guess);
}

/* ---------- slots ---------- */

export interface SlotRule {
  daysOfWeek: readonly number[];
  timeOfDay: string;
  timezone: string;
}

/** The posting moments of a schedule after `from` and within `horizonDays` local days, oldest first (at most one run's worth). */
export function slotsFor(rule: SlotRule, from: Date, horizonDays: number): Date[] {
  const first = localDay(from, rule.timezone);
  const out: Date[] = [];
  for (let i = 0; i <= horizonDays && out.length < MAX_SLOTS_PER_SCHEDULE_RUN; i += 1) {
    const day = addDays(first, i);
    if (!rule.daysOfWeek.includes(weekdayOf(day))) continue;
    const at = zonedToUtc(day, rule.timeOfDay, rule.timezone);
    if (at.getTime() > from.getTime()) out.push(at);
  }
  return out;
}

/** When an evergreen plan posts next: the day it last ran plus its interval, at its local time; a plan that never ran is due today. */
export function evergreenDue(
  plan: { everyDays: number; timeOfDay: string; timezone: string; lastRunAt: string | null },
  now: Date,
): boolean {
  const day =
    plan.lastRunAt === null
      ? localDay(now, plan.timezone)
      : addDays(localDay(new Date(plan.lastRunAt), plan.timezone), plan.everyDays);
  return zonedToUtc(day, plan.timeOfDay, plan.timezone).getTime() <= now.getTime();
}

export interface EvergreenPick {
  id: string;
  priority: number;
  lastPostedAt: string | null;
  variants: readonly string[];
  nextVariant: number;
}

/** The items in the order they are posted: the highest priority first, and among equals the one posted longest ago (never posted first). */
export function rankEvergreen<T extends EvergreenPick>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.lastPostedAt === null
        ? b.lastPostedAt === null
          ? 0
          : -1
        : b.lastPostedAt === null
          ? 1
          : a.lastPostedAt.localeCompare(b.lastPostedAt)) ||
      a.id.localeCompare(b.id),
  );
}

/** The text variant to use now and the index to use next time (variants rotate). */
export function variantFor(item: Pick<EvergreenPick, 'variants' | 'nextVariant'>): {
  text: string;
  next: number;
} {
  const n = item.variants.length;
  const index = n === 0 ? 0 : item.nextVariant % n;
  return { text: item.variants[index] ?? '', next: n === 0 ? 0 : (index + 1) % n };
}

/** Is the queue of an account too short? */
export const queueLow = (enabledItems: number, minItems: number): boolean =>
  minItems > 0 && enabledItems < minItems;
