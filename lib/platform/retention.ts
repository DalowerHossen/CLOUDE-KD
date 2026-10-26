// path: lib/platform/retention.ts
// Rules of the exit survey and the retention offers: the fixed list of reasons, the input of the survey and of the offers, and
// which offer fits a reason. Safe to import in the browser.
import { z } from 'zod';

export const REASON_CODES = [
  'too_expensive',
  'missing_feature',
  'not_using',
  'found_alternative',
  'hard_to_use',
  'support',
  'other',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
export const TRIGGERS = ['cancel', 'downgrade'] as const;
export type Trigger = (typeof TRIGGERS)[number];

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const planSlug = z.string().regex(/^[a-z][a-z0-9_]{1,30}$/);

/** What the cancel and plan-change routes accept besides their own fields: the answer to "why are you leaving?". */
export const surveyAnswerSchema = z
  .object({
    reasonCode: z.enum(REASON_CODES),
    detail: plain(0, 500),
    offerId: z.string().uuid().nullable(),
  })
  .strict();
export type SurveyAnswer = z.infer<typeof surveyAnswerSchema>;

/** The company stayed because of the offer (or after seeing it). */
export const savedSchema = z
  .object({
    trigger: z.enum(TRIGGERS),
    reasonCode: z.enum(REASON_CODES),
    detail: plain(0, 500),
    offerId: z.string().uuid().nullable(),
    planTo: planSlug.nullable(),
  })
  .strict();
export type SavedInput = z.infer<typeof savedSchema>;

export const offerQuerySchema = z
  .object({ trigger: z.enum(TRIGGERS), reasonCode: z.enum(REASON_CODES) })
  .strict();

export const offerActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save'),
      trigger: z.enum(TRIGGERS),
      reasonCode: z.enum(REASON_CODES).nullable(),
      title: plain(3, 100),
      message: plain(3, 600),
      couponCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/)
        .nullable(),
    })
    .strict(),
  z.object({ action: z.enum(['disable', 'enable']), id: z.string().uuid() }).strict(),
]);
export type OfferAction = z.infer<typeof offerActionSchema>;

export interface OfferRow {
  id: string;
  triggerKind: Trigger;
  reasonCode: ReasonCode | null;
  title: string;
  message: string;
  couponCode: string | null;
  createdAt: string;
}

/** The offer for a reason: one made for that reason wins over one for any reason; among equals the newest wins. */
export function bestOffer(
  rows: readonly OfferRow[],
  trigger: Trigger,
  reason: ReasonCode,
): OfferRow | null {
  const fits = rows
    .filter((o) => o.triggerKind === trigger && (o.reasonCode === reason || o.reasonCode === null))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return fits.find((o) => o.reasonCode === reason) ?? fits[0] ?? null;
}

/** Percent of surveys that ended in "saved", whole number, or null when there are none. */
export function saveRate(saved: number, total: number): number | null {
  return total > 0 ? Math.round((saved * 100) / total) : null;
}
