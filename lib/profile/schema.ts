// path: lib/profile/schema.ts
// The personal profile of a signed-in person: display name and time zone (the login e-mail changes through its own flow).
import { z } from 'zod';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const profileInput = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Enter your full name (at least 2 characters).')
      .max(200)
      .refine((v) => !/[<>]/.test(v), 'The name cannot contain the characters < or >.'),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(isTimeZone, 'Choose a valid time zone, for example Asia/Dhaka.'),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export type ProfileInput = z.infer<typeof profileInput>;

export interface OwnProfile {
  fullName: string;
  email: string;
  timezone: string;
  version: number;
}
