// path: lib/support/opinion.ts
// Feedback and NPS rules and input. Safe to import in the browser.
import { z } from 'zod';

export const NPS_MIN_COMPANY_DAYS = 14;
export const NPS_REPEAT_DAYS = 90;
export const NPS_DISMISS_DAYS = 30;
const DAY = 86_400_000;

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const feedbackActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('nps'),
      score: z.number().int().min(0).max(10),
      comment: plain(0, 1000),
    })
    .strict(),
  z
    .object({
      action: z.literal('feedback'),
      category: z.enum(['idea', 'problem', 'praise', 'other']),
      comment: plain(1, 2000),
      page: z
        .string()
        .max(200)
        .regex(/^(\/[A-Za-z0-9._~\-/]*)?$/),
    })
    .strict(),
  z.object({ action: z.literal('dismiss') }).strict(),
]);
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;

/** The prompt is shown to a person when the company is old enough, and they have not answered or waved it away lately. */
export function npsPromptDue(input: {
  companyCreatedAt: Date;
  lastAnsweredAt: Date | null;
  dismissedUntil: Date | null;
  now: Date;
}): boolean {
  if (input.now.getTime() - input.companyCreatedAt.getTime() < NPS_MIN_COMPANY_DAYS * DAY)
    return false;
  if (input.dismissedUntil && input.dismissedUntil > input.now) return false;
  if (
    input.lastAnsweredAt &&
    input.now.getTime() - input.lastAnsweredAt.getTime() < NPS_REPEAT_DAYS * DAY
  )
    return false;
  return true;
}

export interface NpsSummary {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** Percent promoters minus percent detractors, -100 to 100; null without answers. */
  score: number | null;
}

export function summarizeNps(scores: readonly number[]): NpsSummary {
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const responses = scores.length;
  return {
    responses,
    promoters,
    passives: responses - promoters - detractors,
    detractors,
    score: responses === 0 ? null : Math.round(((promoters - detractors) / responses) * 100),
  };
}
