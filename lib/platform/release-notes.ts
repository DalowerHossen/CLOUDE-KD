// path: lib/platform/release-notes.ts
// Rules of "What's new" and product tours: the shape of a release note and its tour steps, and which notes a reader has not seen.
// Safe to import in the browser.
import { z } from 'zod';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const MAX_TOUR_STEPS = 8;

export const tourStepSchema = z
  .object({
    title: plain(2, 80),
    body: plain(2, 400),
    // A page inside the app that the step points to, for example /invoices. Never an outside address.
    href: z
      .string()
      .regex(/^\/[A-Za-z0-9/_-]{0,80}$/)
      .nullable(),
  })
  .strict();
export type TourStep = z.infer<typeof tourStepSchema>;

export const releaseActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('publish'),
      title: plain(3, 120),
      body: plain(3, 4000),
      kind: z.enum(['feature', 'improvement', 'fix']),
      audience: z.enum(['all', 'owners']),
      tour: z.array(tourStepSchema).max(MAX_TOUR_STEPS),
    })
    .strict(),
  z.object({ action: z.literal('withdraw'), id: z.string().uuid() }).strict(),
]);
export type ReleaseAction = z.infer<typeof releaseActionSchema>;

export const seenSchema = z
  .object({
    action: z.enum(['seen', 'tour_done']),
    ids: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();
export type SeenInput = z.infer<typeof seenSchema>;

/** The ids of the notes that are not in the list of seen ids. */
export function unseen(noteIds: readonly string[], seenIds: ReadonlySet<string>): string[] {
  return noteIds.filter((id) => !seenIds.has(id));
}
