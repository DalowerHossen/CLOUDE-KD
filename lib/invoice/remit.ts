// path: lib/invoice/remit.ts
// "Remit to" bank details printed on invoices. Safe to import in the browser.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';

export const remitToSchema = z
  .object({
    bankName: plain(0, 100),
    accountName: plain(0, 100),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z -]{0,34}$/, { message: 'Use letters, digits, spaces and dashes only.' }),
    routingNumber: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z -]{0,20}$/, { message: 'Use letters, digits, spaces and dashes only.' }),
    swift: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z0-9]{8}|[A-Z0-9]{11})?$/, {
        message: 'A SWIFT or BIC code has 8 or 11 characters.',
      }),
    iban: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2}[0-9]{2}[A-Z0-9]{1,30})?$/, { message: 'Check the IBAN.' }),
    instructions: plain(0, 500),
  })
  .strict();
export type RemitTo = z.infer<typeof remitToSchema>;

export const EMPTY_REMIT_TO: RemitTo = {
  bankName: '',
  accountName: '',
  accountNumber: '',
  routingNumber: '',
  swift: '',
  iban: '',
  instructions: '',
};

export function hasRemitTo(r: RemitTo | null): r is RemitTo {
  return r !== null && Object.values(r).some((v) => v !== '');
}
