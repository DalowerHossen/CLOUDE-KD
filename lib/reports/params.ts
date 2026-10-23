// path: lib/reports/params.ts
// What a person chooses for a report: a period (a named range or two dates), a grouping, and whether to compare with the
// period before. Safe to import in the browser.
import { z } from 'zod';
import { RANGE_KEYS, previousRange, rangeFor, type DateRange } from './ranges';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });

export const reportParamsSchema = z
  .object({
    range: z.enum(RANGE_KEYS).optional(),
    from: day.optional(),
    to: day.optional(),
    groupBy: z.enum(['project', 'person']).optional(),
    compare: z.boolean().optional(),
  })
  .strict()
  .refine((v) => (v.from === undefined) === (v.to === undefined), {
    message: 'Enter both dates.',
    path: ['to'],
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.to >= v.from, {
    message: 'The end date cannot be before the start date.',
    path: ['to'],
  })
  .refine(
    (v) =>
      v.from === undefined ||
      v.to === undefined ||
      Date.parse(v.to) - Date.parse(v.from) <= 3 * 366 * 86_400_000,
    {
      message: 'A report covers three years at most.',
      path: ['to'],
    },
  );
export type ReportParams = z.infer<typeof reportParamsSchema>;

export interface ResolvedParams {
  from: string;
  to: string;
  groupBy: 'project' | 'person';
  compare: boolean;
  today: string;
  previous: DateRange;
}

/** Concrete dates for the params. No dates and no range means "this month". */
export function resolveParams(p: ReportParams, today: string): ResolvedParams {
  let range: DateRange;
  if (p.from !== undefined && p.to !== undefined) range = { from: p.from, to: p.to };
  else range = rangeFor(p.range ?? 'month', today);
  const key = p.from !== undefined ? 'last_30' : (p.range ?? 'month');
  const previous =
    p.from !== undefined ? previousRange('last_30', range) : previousRange(key, range);
  return {
    ...range,
    groupBy: p.groupBy ?? 'project',
    compare: p.compare === true,
    today,
    previous,
  };
}

export const presetInputSchema = z
  .object({
    reportKey: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    name: z.string().trim().min(1).max(80),
    params: reportParamsSchema,
  })
  .strict();

/** A schedule uses a named range (so each run covers a fresh period), never fixed dates. */
export const scheduleInputSchema = z
  .object({
    reportKey: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    name: z.string().trim().min(1).max(80),
    range: z.enum(RANGE_KEYS),
    groupBy: z.enum(['project', 'person']).optional(),
    format: z.enum(['csv', 'xlsx', 'pdf']),
    frequency: z.enum(['weekly', 'monthly']),
    weekday: z.number().int().min(1).max(7).nullable(),
    monthDay: z.number().int().min(1).max(28).nullable(),
    recipients: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'Enter a valid e-mail address.' }),
      )
      .min(1)
      .max(10),
    enabled: z.boolean(),
  })
  .strict()
  .refine((v) => (v.frequency === 'weekly' ? v.weekday !== null : v.monthDay !== null), {
    message: 'Choose the day it runs.',
    path: ['weekday'],
  });
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/** Report options as they arrive in a URL query string. */
export const reportQuerySchema = z
  .object({
    range: z.enum(RANGE_KEYS).optional(),
    from: day.optional(),
    to: day.optional(),
    groupBy: z.enum(['project', 'person']).optional(),
    compare: z.enum(['true', 'false']).optional(),
    format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
  })
  .strict();

export function paramsFromQuery(q: z.infer<typeof reportQuerySchema>): ReportParams {
  return {
    ...(q.range ? { range: q.range } : {}),
    ...(q.from ? { from: q.from } : {}),
    ...(q.to ? { to: q.to } : {}),
    ...(q.groupBy ? { groupBy: q.groupBy } : {}),
    compare: q.compare === 'true',
  };
}
