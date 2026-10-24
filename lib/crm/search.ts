// path: lib/crm/search.ts
// Input of the client list, saved views, notes, duplicate checks and merge. Safe to import in the browser.
import { z } from 'zod';
import { plain } from './clients';

export const CLIENT_SORTS = ['name', 'created', 'balance', 'last_invoice'] as const;
export const PAGE_LIMIT = 25;

export const clientListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'archived']).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    risk: z.enum(['none', 'watch', 'high']).optional(),
    withBalance: z.enum(['1']).optional(),
    sort: z.enum(CLIENT_SORTS).default('name'),
    desc: z.enum(['0', '1']).default('0'),
    after: z.string().max(300).optional(),
  })
  .strict();
export type ClientListQuery = z.infer<typeof clientListQuery>;

export interface Cursor {
  v: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const cursorShape = z.object({ v: z.string().max(60), id: z.string().uuid() }).strict();
export function decodeCursor(text: string | undefined): Cursor | null {
  if (!text) return null;
  try {
    const padded =
      text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const parsed = cursorShape.safeParse(JSON.parse(atob(padded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The filters a saved view remembers (the same names as the list address). */
export const viewFiltersSchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'archived']).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    risk: z.enum(['none', 'watch', 'high']).optional(),
    withBalance: z.enum(['1']).optional(),
    sort: z.enum(CLIENT_SORTS).optional(),
    desc: z.enum(['0', '1']).optional(),
  })
  .strict();

export const viewCreateSchema = z
  .object({
    listKey: z.enum(['clients', 'products', 'suppliers', 'purchase_orders']),
    name: plain(1, 60),
    filters: z.record(z.string(), z.string().max(80)),
  })
  .strict();
export const viewDeleteSchema = z.object({ id: z.string().uuid() }).strict();
export const MAX_VIEWS = 20;

export const activitySchema = z
  .object({
    kind: z.enum(['note', 'call', 'meeting', 'email']),
    title: plain(0, 200),
    body: plain(0, 5000),
  })
  .strict()
  .refine((v) => v.title !== '' || v.body !== '', { message: 'Write something.', path: ['body'] });

export const duplicateQuery = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().max(254).optional(),
    taxId: z.string().trim().max(40).optional(),
    exclude: z.string().uuid().optional(),
  })
  .strict();

export const mergeSchema = z
  .object({ keepId: z.string().uuid(), removeId: z.string().uuid() })
  .strict()
  .refine((v) => v.keepId !== v.removeId, { message: 'Choose two different clients.' });

export const statementQuery = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'The start must not be after the end.' });
