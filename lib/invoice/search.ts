// path: lib/invoice/search.ts
// Query of the invoice list (the address of the list page and of the list route). Safe to import in the browser.
import { z } from 'zod';
import { INVOICE_STATUSES } from './status';
import { INVOICE_KINDS } from './input';

export const PAGE_SIZES = [25, 50, 100] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);

export const invoiceListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    /** Comma separated statuses, for example "sent,overdue". */
    status: z
      .string()
      .regex(/^[a-z_]+(,[a-z_]+){0,8}$/)
      .refine(
        (v) => v.split(',').every((s) => (INVOICE_STATUSES as readonly string[]).includes(s)),
        {
          message: 'Unknown status.',
        },
      )
      .optional(),
    kind: z.enum(INVOICE_KINDS).optional(),
    client: z.string().uuid().optional(),
    from: day.optional(),
    to: day.optional(),
    min: amount.optional(),
    max: amount.optional(),
    trash: z.enum(['1']).optional(),
    sort: z
      .enum(['issue', 'due', 'amount', 'status', 'client', 'number', 'created'])
      .default('issue'),
    desc: z.enum(['0', '1']).default('1'),
    size: z.enum(['25', '50', '100']).default('25'),
    after: z.string().max(300).optional(),
  })
  .strict();
export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;

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
