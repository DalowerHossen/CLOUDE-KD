// path: lib/platform/controls.ts
// Rules of the operations controls: the maintenance switch (with an optional start and end), kill switches and per-company
// caps. Safe to import in the browser.
import { z } from 'zod';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const isoDate = z.string().datetime({ offset: true });

export const maintenanceSchema = z
  .object({
    enabled: z.boolean(),
    message: plain(0, 300),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
  })
  .strict()
  .refine((v) => v.startsAt === null || v.endsAt === null || v.endsAt > v.startsAt, {
    message: 'The end must be after the start.',
    path: ['endsAt'],
  });
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

export const OFF: MaintenanceInput = { enabled: false, message: '', startsAt: null, endsAt: null };
export const DEFAULT_MAINTENANCE_MESSAGE =
  'We are doing planned maintenance. Please come back in a little while.';

/** True while the switch is on and the optional window (start, end) includes `now`. */
export function isMaintenanceActive(value: MaintenanceInput, now: Date = new Date()): boolean {
  if (!value.enabled) return false;
  const t = now.getTime();
  if (value.startsAt !== null && t < Date.parse(value.startsAt)) return false;
  if (value.endsAt !== null && t >= Date.parse(value.endsAt)) return false;
  return true;
}

export const killSwitchSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('engage'),
      flagKey: z.string().regex(/^[a-z][a-z0-9_.]{1,79}$/),
      reason: plain(10, 500),
    })
    .strict(),
  z.object({ action: z.literal('release'), id: z.string().uuid() }).strict(),
]);
export type KillSwitchInput = z.infer<typeof killSwitchSchema>;

export const MIN_CAP = 1;
export const MAX_CAP = 100_000;
export const tenantLimitSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set'),
      companyId: z.string().uuid(),
      limitPerMinute: z.number().int().min(MIN_CAP).max(MAX_CAP),
      reason: plain(10, 500),
      expiresAt: isoDate.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('clear'), companyId: z.string().uuid() }).strict(),
]);
export type TenantLimitInput = z.infer<typeof tenantLimitSchema>;

/** A kill switch for a module flag key ("module.x") also switches off the module for every company. */
export function isKilled(flagKey: string, engaged: ReadonlySet<string>): boolean {
  return engaged.has(flagKey);
}

/** The cap in force, or null when none is set or it has run out. */
export function activeCap(
  row: { limitPerMinute: number; expiresAt: string | null } | null,
  now: Date = new Date(),
): number | null {
  if (!row) return null;
  if (row.expiresAt !== null && Date.parse(row.expiresAt) <= now.getTime()) return null;
  return row.limitPerMinute;
}
