// path: services/hr/hr-rules.ts
// HR as pure functions: the input shapes, working days of a leave request, the days left, the yearly leave for someone who joined
// during the year (pro rata) with carry over, the organisation and reporting trees (with the loop check), the default onboarding
// and offboarding lists, and the performance report. No database here.
import { z } from 'zod';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { dayText } from '@/services/accounting/journal-rules';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const uuid = z.string().uuid();
const days = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter days like 20 or 12.5.');

/* ---------- organisation ---------- */

export const departmentInput = z
  .object({
    name: plain(1, 80),
    parentId: uuid.nullable().default(null),
    headEmployeeId: uuid.nullable().default(null),
  })
  .strict();
export const departmentUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 80).optional(),
    parentId: uuid.nullable().optional(),
    headEmployeeId: uuid.nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict();
export const positionInput = z
  .object({ title: plain(1, 80), departmentId: uuid.nullable().default(null) })
  .strict();
/** Where an employee sits: department, position and the manager they report to (each can be cleared with null). */
export const assignInput = z
  .object({
    version: z.number().int().min(1),
    departmentId: uuid.nullable().optional(),
    positionId: uuid.nullable().optional(),
    managerId: uuid.nullable().optional(),
  })
  .strict();

export interface OrgNode {
  id: string;
  label: string;
  children: OrgNode[];
}

/** A tree from rows with a parent; rows whose parent is missing become roots; a loop in the data cannot hang the builder. */
export function buildTree(
  rows: readonly { id: string; label: string; parentId: string | null }[],
): OrgNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string | null, (typeof rows)[number][]>();
  for (const r of rows) {
    const key =
      r.parentId !== null && ids.has(r.parentId) && r.parentId !== r.id ? r.parentId : null;
    kids.set(key, [...(kids.get(key) ?? []), r]);
  }
  const seen = new Set<string>();
  const build = (parent: string | null, depth: number): OrgNode[] =>
    (kids.get(parent) ?? [])
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .filter((r) => !seen.has(r.id) && depth < 12)
      .map((r) => {
        seen.add(r.id);
        return { id: r.id, label: r.label, children: build(r.id, depth + 1) };
      });
  return build(null, 0);
}

/** True when making `parent` the parent of `id` would make a loop (parent is inside id's subtree, or is id). */
export function wouldLoop(
  parentOf: ReadonlyMap<string, string | null>,
  id: string,
  parent: string | null,
): boolean {
  let cur = parent;
  for (let i = 0; cur !== null && i < 100; i += 1) {
    if (cur === id) return true;
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

/* ---------- checklists ---------- */

export const templateInput = z
  .object({
    kind: z.enum(['onboarding', 'offboarding']),
    name: plain(1, 80),
    items: z.preprocess(
      (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? { title: x } : x)) : v),
      z
        .array(
          z
            .object({
              title: plain(1, 200),
              daysAfter: z.number().int().min(0).max(365).default(0),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    ),
  })
  .strict();
export const checklistInput = z
  .object({
    employeeId: uuid,
    kind: z.enum(['onboarding', 'offboarding']),
    templateId: uuid.nullable().default(null),
  })
  .strict();
export const tickInput = z.object({ done: z.boolean() }).strict();

export const DEFAULT_TEMPLATES: readonly {
  kind: 'onboarding' | 'offboarding';
  name: string;
  items: readonly { title: string; daysAfter: number }[];
}[] = [
  {
    kind: 'onboarding',
    name: 'New employee',
    items: [
      { title: 'Signed contract received', daysAfter: 0 },
      { title: 'Identity document and tax details collected', daysAfter: 0 },
      { title: 'Bank details entered', daysAfter: 2 },
      { title: 'Laptop and accounts ready', daysAfter: 0 },
      { title: 'Welcome meeting with the manager', daysAfter: 1 },
      { title: 'Policies read and accepted', daysAfter: 7 },
      { title: 'First review of the first month', daysAfter: 30 },
    ],
  },
  {
    kind: 'offboarding',
    name: 'Leaving employee',
    items: [
      { title: 'Resignation or notice letter filed', daysAfter: 0 },
      { title: 'Handover of work done', daysAfter: 0 },
      { title: 'Equipment and access cards returned', daysAfter: 0 },
      { title: 'Accounts and access closed', daysAfter: 0 },
      { title: 'Final pay checked (pay run for the last days, unused leave)', daysAfter: 0 },
      { title: 'Exit conversation held', daysAfter: 0 },
    ],
  },
];

/** The due date of a task: the start date and the days after it. */
export function dueDay(start: string, daysAfter: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + daysAfter * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/* ---------- leave ---------- */

export const leaveTypeInput = z
  .object({
    name: plain(1, 60),
    annualDays: days,
    paid: z.boolean().default(true),
    carryOverDays: days.default('0'),
  })
  .strict();
export const balanceInput = z
  .object({
    employeeId: uuid,
    leaveTypeId: uuid,
    year: z.number().int().min(2000).max(2200),
    entitled: days,
  })
  .strict();
const leaveBase = z.object({
  employeeId: uuid,
  leaveTypeId: uuid,
  startDate: dayText,
  endDate: dayText,
  halfDay: z.boolean().default(false),
  reason: plain(0, 500).default(''),
});

/** The first problem with the dates of a request, or null. */
function leaveProblem(v: {
  startDate: string;
  endDate: string;
  halfDay: boolean;
}): { path: string; message: string } | null {
  if (v.endDate < v.startDate)
    return { path: 'endDate', message: 'The leave cannot end before it starts.' };
  if (v.startDate.slice(0, 4) !== v.endDate.slice(0, 4))
    return {
      path: 'endDate',
      message: 'A request stays inside one calendar year. Make two requests.',
    };
  if (v.halfDay && v.startDate !== v.endDate)
    return { path: 'halfDay', message: 'A half day is one day.' };
  return null;
}

export const leaveRequestInput = leaveBase.strict().superRefine((v, ctx) => {
  const p = leaveProblem(v);
  if (p) ctx.addIssue({ code: 'custom', path: [p.path], message: p.message });
});
/** What an employee sends from the portal: the link says who they are. */
export const portalLeaveInput = leaveBase
  .omit({ employeeId: true })
  .strict()
  .superRefine((v, ctx) => {
    const p = leaveProblem(v);
    if (p) ctx.addIssue({ code: 'custom', path: [p.path], message: p.message });
  });
export const leaveDecideInput = z
  .object({ decision: z.enum(['approve', 'reject']), note: plain(0, 300).default('') })
  .strict()
  .refine((v) => v.decision === 'approve' || v.note.length >= 3, {
    message: 'Give a reason for the rejection.',
    path: ['note'],
  });

/** Working days (Monday to Friday) from start to end, both included; half a day for a one-day half day request. */
export function leaveDays(start: string, end: string, halfDay: boolean): string {
  if (end < start) return '0';
  let count = 0;
  for (
    let t = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
    t <= last;
    t += 86_400_000
  ) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  if (halfDay) return count === 1 ? '0.5' : '0';
  return String(count);
}

/** Days still free to ask for: entitled less used less the days of requests that wait for a decision. */
export function daysLeft(entitled: string, used: string, waiting: string): string {
  return Money.max(Money.parse(entitled).sub(used).sub(waiting), Money.zero()).toDbString();
}

/**
 * The leave of a year for an employee: the yearly days of the type, in proportion to the months employed when the person joined
 * during the year (rounded to half days), plus what is carried over from last year up to the carry over limit.
 */
export function yearlyEntitlement(
  annualDays: string,
  joinDate: string,
  year: number,
  carryOverLimit: string,
  previousLeft: string,
): string {
  const joinYear = toInt(joinDate.slice(0, 4));
  const monthsIn = joinYear < year ? 12 : joinYear > year ? 0 : 13 - toInt(joinDate.slice(5, 7));
  const base = Money.parse(annualDays).mul(String(monthsIn)).div('12');
  const halves = base.mul('2').toParts(0).integer;
  const rounded = Money.parse(halves).div('2');
  const carry = Money.min(Money.parse(previousLeft), Money.parse(carryOverLimit));
  return rounded.add(carry).toDbString();
}

/* ---------- performance ---------- */

export const performanceInput = z
  .object({
    employeeId: uuid,
    kind: z.enum(['note', 'review']).default('note'),
    period: plain(0, 20).default(''),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    body: plain(1, 2000),
    raiseSuggested: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'note' && v.rating !== null)
      ctx.addIssue({ code: 'custom', path: ['rating'], message: 'A rating belongs to a review.' });
    if (v.kind === 'review' && (v.rating === null || v.period === ''))
      ctx.addIssue({
        code: 'custom',
        path: ['rating'],
        message: 'A review needs a period and a rating from 1 to 5.',
      });
  });

export interface NoteRow {
  employeeId: string;
  kind: 'note' | 'review';
  period: string;
  rating: number | null;
  raiseSuggested: boolean;
}

export interface PerformanceRow {
  employeeId: string;
  period: string;
  reviews: number;
  notes: number;
  average: string | null;
  raiseSuggested: boolean;
}

/** Per employee and period: how many reviews and notes, the average rating (one decimal), and whether a raise was suggested. */
export function performanceReport(rows: readonly NoteRow[]): PerformanceRow[] {
  const groups = new Map<string, NoteRow[]>();
  for (const r of rows)
    groups.set(`${r.employeeId}|${r.period}`, [
      ...(groups.get(`${r.employeeId}|${r.period}`) ?? []),
      r,
    ]);
  return [...groups.values()]
    .map((g) => {
      const rated = g.filter((x) => x.kind === 'review' && x.rating !== null);
      const sum = rated.reduce((s, x) => s + (x.rating ?? 0), 0);
      let average: string | null = null;
      if (rated.length > 0) {
        const { integer, fraction } = Money.parse(String(sum)).div(String(rated.length)).toParts(1);
        average = `${integer}.${fraction}`;
      }
      return {
        employeeId: g[0]?.employeeId ?? '',
        period: g[0]?.period ?? '',
        reviews: rated.length,
        notes: g.filter((x) => x.kind === 'note').length,
        average,
        raiseSuggested: g.some((x) => x.raiseSuggested),
      };
    })
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.period.localeCompare(b.period));
}
