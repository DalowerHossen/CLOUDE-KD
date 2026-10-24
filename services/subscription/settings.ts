// path: services/subscription/settings.ts
// The billing settings of the platform: who sends the invoice, how to pay by bank transfer, the tax percent by the
// buyer's country, the grace days. One row; only the super admin changes it. Until it is saved the starting values of
// config/s14-subscriptions.ts apply and the tax is 0.
import 'server-only';
import { z } from 'zod';
import { GRACE_DAYS } from '@/config/s14-subscriptions';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface BillingSettings {
  sellerName: string;
  sellerAddress: string;
  sellerTaxId: string;
  bankInstructions: string;
  defaultTaxPercent: string;
  taxPercentByCountry: Record<string, string>;
  graceDays: number;
  operatorCompanyId: string | null;
}

export const DEFAULT_BILLING: BillingSettings = {
  sellerName: 'KD SOLUTION IT',
  sellerAddress: '',
  sellerTaxId: '',
  bankInstructions: '',
  defaultTaxPercent: '0',
  taxPercentByCountry: {},
  graceDays: GRACE_DAYS,
  operatorCompanyId: null,
};

const plain = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const percent = z.string().regex(/^\d{1,2}(\.\d{1,4})?$/, 'Enter a percent like 15 or 7.5.');

export const billingSettingsInput = z
  .object({
    sellerName: plain(200).optional(),
    sellerAddress: plain(500).optional(),
    sellerTaxId: plain(60).optional(),
    bankInstructions: plain(1000).optional(),
    defaultTaxPercent: percent.optional(),
    taxPercentByCountry: z.record(z.string().regex(/^[A-Z]{2}$/), percent).optional(),
    graceDays: z.number().int().min(0).max(60).nullable().optional(),
    operatorCompanyId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function loadBilling(): Promise<BillingSettings> {
  const { data, error } = await getAdminSupabase()
    .from('billing_settings')
    .select(
      'seller_name, seller_address, seller_tax_id, bank_instructions, default_tax_percent, tax_percent_by_country, grace_days, operator_company_id',
    )
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULT_BILLING;
  return {
    sellerName: String(data.seller_name) || DEFAULT_BILLING.sellerName,
    sellerAddress: String(data.seller_address),
    sellerTaxId: String(data.seller_tax_id),
    bankInstructions: String(data.bank_instructions),
    defaultTaxPercent: String(data.default_tax_percent),
    taxPercentByCountry: (data.tax_percent_by_country ?? {}) as Record<string, string>,
    graceDays: data.grace_days === null ? GRACE_DAYS : toInt(data.grace_days, GRACE_DAYS),
    operatorCompanyId: data.operator_company_id ? String(data.operator_company_id) : null,
  };
}

export async function saveBilling(actor: Actor, input: unknown): Promise<BillingSettings> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const parsed = billingSettingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  if (d.sellerName !== undefined) patch.seller_name = d.sellerName;
  if (d.sellerAddress !== undefined) patch.seller_address = d.sellerAddress;
  if (d.sellerTaxId !== undefined) patch.seller_tax_id = d.sellerTaxId;
  if (d.bankInstructions !== undefined) patch.bank_instructions = d.bankInstructions;
  if (d.defaultTaxPercent !== undefined) patch.default_tax_percent = d.defaultTaxPercent;
  if (d.taxPercentByCountry !== undefined) patch.tax_percent_by_country = d.taxPercentByCountry;
  if (d.graceDays !== undefined) patch.grace_days = d.graceDays;
  if (d.operatorCompanyId !== undefined) patch.operator_company_id = d.operatorCompanyId;
  const admin = getAdminSupabase();
  const current = await admin
    .from('billing_settings')
    .select('id')
    .is('deleted_at', null)
    .maybeSingle();
  if (current.error) throw new InternalError(current.error);
  const written = current.data
    ? await admin.from('billing_settings').update(patch).eq('id', current.data.id)
    : await admin.from('billing_settings').insert({ ...patch, company_id: null });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'subscription.billing_settings_saved',
    resourceType: 'billing_settings',
    resourceId: current.data?.id ?? null,
    companyId: null,
    metadata: { fields: Object.keys(d) },
  });
  return loadBilling();
}
