// path: lib/company/admin-input.ts
// Input of the platform screens for users and tenants. Safe to import in the browser.
import { z } from 'zod';

const plain = (max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const userListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    role: z.enum(['owner', 'staff', 'platform']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export type UserListQuery = z.infer<typeof userListQuery>;

export const tenantListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    plan: z
      .string()
      .regex(/^[a-z_]{2,30}$/)
      .optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export type TenantListQuery = z.infer<typeof tenantListQuery>;

export const PAGE_SIZE = 25;

export const peopleActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.enum(['user.suspend', 'user.reactivate', 'tenant.suspend', 'tenant.reactivate']),
      id: z.string().uuid(),
      reason: plain(1000).refine((v) => v.length >= 10, {
        message: 'Give a reason of at least 10 characters.',
      }),
    })
    .strict(),
  z.object({ action: z.literal('user.verify_email'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('note'),
      subject: z.enum(['user', 'tenant']),
      id: z.string().uuid(),
      body: plain(2000).refine((v) => v.length >= 1, { message: 'Write a note.' }),
    })
    .strict(),
]);
export type PeopleAction = z.infer<typeof peopleActionSchema>;
