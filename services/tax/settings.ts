// path: services/tax/settings.ts
// Tax and calculation settings of a company (one row; defaults until the first save).
import { toInt } from '@/lib/reports/numbers';
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import type { TaxSettingsInput } from '@/lib/tax/input';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface TaxSettingsView extends TaxSettingsInput {
  /** Null while the company has not saved settings yet. */
  version: number | null;
}

export const DEFAULT_TAX_SETTINGS: TaxSettingsInput = {
  priceMode: 'exclusive',
  discountOrder: 'before_tax',
  roundingPolicy: 'per_line',
  roundingMode: 'half_up',
  precision: 2,
  cashRounding: '0',
  fiscalYearStartMonth: 1,
  sellerTaxLabel: '',
  sellerTaxId: '',
  sellerCountry: null,
  reverseCharge: false,
  marketplaceFacilitator: false,
  nexusRegions: [],
  defaultTaxCodes: [],
  defaultWithholding: '0',
};

const COLUMNS =
  'price_mode, discount_order, rounding_policy, rounding_mode, precision, cash_rounding, fiscal_year_start_month, seller_tax_label, seller_tax_id, seller_country, reverse_charge, marketplace_facilitator, nexus_regions, default_tax_codes, default_withholding, version';

function columns(i: TaxSettingsInput): Record<string, unknown> {
  return {
    price_mode: i.priceMode,
    discount_order: i.discountOrder,
    rounding_policy: i.roundingPolicy,
    rounding_mode: i.roundingMode,
    precision: i.precision,
    cash_rounding: i.cashRounding,
    fiscal_year_start_month: i.fiscalYearStartMonth,
    seller_tax_label: i.sellerTaxLabel,
    seller_tax_id: i.sellerTaxId,
    seller_country: i.sellerCountry,
    reverse_charge: i.reverseCharge,
    marketplace_facilitator: i.marketplaceFacilitator,
    nexus_regions: i.nexusRegions,
    default_tax_codes: i.defaultTaxCodes,
    default_withholding: i.defaultWithholding,
  };
}

export async function getTaxSettings(companyId: string): Promise<TaxSettingsView> {
  const { data, error } = await getAdminSupabase()
    .from('tax_settings')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return { ...DEFAULT_TAX_SETTINGS, version: null };
  const r = data as unknown as Record<string, unknown>;
  return {
    priceMode: String(r.price_mode) as TaxSettingsInput['priceMode'],
    discountOrder: String(r.discount_order) as TaxSettingsInput['discountOrder'],
    roundingPolicy: String(r.rounding_policy) as TaxSettingsInput['roundingPolicy'],
    roundingMode: String(r.rounding_mode) as TaxSettingsInput['roundingMode'],
    precision: toInt(r.precision, 2) as TaxSettingsInput['precision'],
    cashRounding: String(r.cash_rounding) as TaxSettingsInput['cashRounding'],
    fiscalYearStartMonth: toInt(r.fiscal_year_start_month, 1),
    sellerTaxLabel: String(r.seller_tax_label ?? ''),
    sellerTaxId: String(r.seller_tax_id ?? ''),
    sellerCountry: r.seller_country ? String(r.seller_country) : null,
    reverseCharge: r.reverse_charge === true,
    marketplaceFacilitator: r.marketplace_facilitator === true,
    nexusRegions: ((r.nexus_regions as string[] | null) ?? []) as TaxSettingsInput['nexusRegions'],
    defaultTaxCodes: (r.default_tax_codes as string[] | null) ?? [],
    defaultWithholding: Money.parseRounded(String(r.default_withholding)).toDbString(),
    version: toInt(r.version, 1),
  };
}

export async function saveTaxSettings(
  actor: Actor,
  expectedVersion: number | null,
  input: TaxSettingsInput,
): Promise<TaxSettingsView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  if (expectedVersion === null) {
    const { error } = await admin
      .from('tax_settings')
      .insert({ company_id: companyId, ...columns(input) });
    if (error) {
      if (error.code === '23505') throw new ConflictError();
      throw new InternalError(error);
    }
  } else {
    const r = await admin
      .from('tax_settings')
      .update(columns(input))
      .eq('company_id', companyId)
      .eq('version', expectedVersion)
      .is('deleted_at', null)
      .select('company_id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'tax_settings.saved',
    resourceType: 'tax_settings',
    resourceId: null,
    companyId,
    metadata: { by: actor.userId },
  });
  return getTaxSettings(companyId);
}
