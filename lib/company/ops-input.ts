// path: lib/company/ops-input.ts
// Input of the platform operations screens: admin staff and shifts, announcements, feature flags, setup wizard.
// Safe to import in the browser.
import { z } from 'zod';
import { ADMIN_SUB_ROLES } from '@/types/contracts/common';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const uuid = z.string().uuid();

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** "09:30" to minutes of the day; "24:00" is allowed only as an end time. */
export function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function fromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
export const shiftSchema = z
  .object({ weekday: z.number().int().min(0).max(6), start: clock, end: clock })
  .strict()
  .refine((s) => s.start !== '24:00' && toMinutes(s.end) > toMinutes(s.start), {
    message: 'A shift must end after it starts.',
  });
export const shiftsSchema = z
  .array(shiftSchema)
  .max(42)
  .superRefine((rows, ctx) => {
    for (let i = 0; i < rows.length; i += 1)
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];
        if (
          a &&
          b &&
          a.weekday === b.weekday &&
          toMinutes(a.start) < toMinutes(b.end) &&
          toMinutes(b.start) < toMinutes(a.end)
        )
          ctx.addIssue({ code: 'custom', message: 'Two shifts on the same day overlap.' });
      }
  });

export const staffActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      email: z.string().trim().toLowerCase().email().max(254),
      fullName: plain(1, 200),
      subRole: z.enum(ADMIN_SUB_ROLES),
    })
    .strict(),
  z
    .object({ action: z.literal('sub_role'), userId: uuid, subRole: z.enum(ADMIN_SUB_ROLES) })
    .strict(),
  z.object({ action: z.literal('shifts'), userId: uuid, shifts: shiftsSchema }).strict(),
  z.object({ action: z.literal('resend'), userId: uuid }).strict(),
]);
export type StaffAction = z.infer<typeof staffActionSchema>;

export const announcementSchema = z
  .object({
    action: z.literal('publish'),
    title: plain(1, 120),
    body: plain(1, 2000),
    kind: z.enum(['info', 'maintenance', 'warning']),
    audience: z.enum(['all', 'owners']),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((a) => Date.parse(a.endsAt) > Date.parse(a.startsAt), {
    message: 'The end must be after the start.',
    path: ['endsAt'],
  })
  .refine((a) => Date.parse(a.endsAt) - Date.parse(a.startsAt) <= 90 * 86_400_000, {
    message: 'An announcement can run for at most 90 days.',
    path: ['endsAt'],
  });
export const announcementActionSchema = z.union([
  announcementSchema,
  z.object({ action: z.literal('withdraw'), id: uuid }).strict(),
]);
export type AnnouncementAction = z.infer<typeof announcementActionSchema>;

export const flagSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.]{1,79}$/),
    companyId: uuid.nullable(),
    enabled: z.boolean(),
    rolloutPercent: z.number().int().min(0).max(100),
    version: z.number().int().min(1).nullable(),
  })
  .strict();
export type FlagInput = z.infer<typeof flagSchema>;

export const SETUP_STEPS = ['approval_mode', 'email', 'security'] as const;
export const setupSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('approval_mode'), choice: z.enum(['solo', 'team']) }).strict(),
  z.object({ step: z.literal('email'), choice: z.literal('confirmed') }).strict(),
  z.object({ step: z.literal('security'), choice: z.literal('confirmed') }).strict(),
]);
export type SetupInput = z.infer<typeof setupSchema>;
