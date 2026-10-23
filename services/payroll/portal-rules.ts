// path: services/payroll/portal-rules.ts
// Employee portal as pure functions: the input shapes (link, declaration, decision), the link address, the payslips an employee
// may see, and how an approved declaration changes the tax details. No database here.
import { z } from 'zod';
import { portalTokenSchema } from '@/services/portal/schemas';
import type { TaxInfo } from './payroll-rules';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

/** Employee links expire quickly: one to 14 days, three by default. */
export const MAX_LINK_DAYS = 14;
export const linkInput = z
  .object({
    ttlDays: z.number().int().min(1).max(MAX_LINK_DAYS).default(3),
    otpRequired: z.boolean().default(true),
    sendEmail: z.boolean().default(true),
  })
  .strict();

const declarationFields = {
  filingStatus: plain(1, 40),
  allowances: z.number().int().min(0).max(50),
  note: plain(0, 300).default(''),
};
export const declarationInput = z.object(declarationFields).strict();
/** The portal sends the link with the declaration; the person is the one the link was made for. */
export const portalDeclarationBody = z.strictObject({
  token: portalTokenSchema,
  ...declarationFields,
});

export const decideDeclarationInput = z
  .object({ decision: z.enum(['approve', 'reject']), reason: plain(0, 300).default('') })
  .strict()
  .refine((v) => v.decision === 'approve' || v.reason.length >= 3, {
    message: 'Give a reason for the rejection.',
    path: ['reason'],
  });

export const portalUrl = (siteUrl: string, token: string): string =>
  `${siteUrl}/p/${encodeURIComponent(token)}`;

export interface PortalItem {
  itemId: string;
  runNumber: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  net: string;
  runStatus: string;
  hasFile: boolean;
}

/** The payslips an employee sees: those of approved and paid runs that have a file, newest first. */
export function visiblePayslips(items: readonly PortalItem[]): PortalItem[] {
  return items
    .filter((i) => (i.runStatus === 'approved' || i.runStatus === 'paid') && i.hasFile)
    .sort(
      (a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.runNumber.localeCompare(a.runNumber),
    );
}

/**
 * The tax details after an approved declaration: the filing status and allowances change and the tax identification number stays.
 * Null when the employee has no tax details yet (a declaration cannot create the number).
 */
export function mergeDeclaration(
  existing: TaxInfo | null,
  d: { filingStatus: string; allowances: number },
): TaxInfo | null {
  if (!existing) return null;
  return { ...existing, filingStatus: d.filingStatus, allowances: d.allowances };
}
