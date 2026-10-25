// path: services/branding/brand.ts
// The brand of one company as client-facing surfaces need it: colours and font (settings, STEP 07), the secondary
// colour, signature and footer (this STEP), the logo address and the plan rules (the platform mark goes away on plans
// with `branding.white_label`).
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { planHas } from '@/services/company/plan';
import { DEFAULT_SECONDARY, type FontKey } from '@/lib/branding/theme';

export interface TenantBrand {
  companyId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontKey: FontKey;
  /** Address of the logo image, or null when the company has none. */
  logoUrl: string | null;
  emailSignature: string;
  clientFooter: string;
  /** True on plans with white label: no platform name, logo, address or "powered by" line anywhere client-facing. */
  whiteLabel: boolean;
}

export interface BrandExtras {
  secondaryColor: string;
  emailSignature: string;
  clientFooter: string;
  version: number;
}

export const DEFAULT_EXTRAS: BrandExtras = {
  secondaryColor: DEFAULT_SECONDARY,
  emailSignature: '',
  clientFooter: '',
  version: 0,
};

export async function getExtras(companyId: string): Promise<BrandExtras> {
  const { data, error } = await getAdminSupabase()
    .from('tenant_branding')
    .select('secondary_color, email_signature, client_footer, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULT_EXTRAS;
  return {
    secondaryColor: String(data.secondary_color),
    emailSignature: String(data.email_signature),
    clientFooter: String(data.client_footer),
    version: Number(data.version),
  };
}

export async function getTenantBrand(companyId: string): Promise<TenantBrand> {
  const [branding, extras, company, whiteLabel] = await Promise.all([
    getSection(companyId, 'branding'),
    getExtras(companyId),
    getAdminSupabase().from('companies').select('name').eq('id', companyId).maybeSingle(),
    planHas(companyId, 'branding.white_label'),
  ]);
  if (company.error) throw new InternalError(company.error);
  const { value } = branding;
  return {
    companyId,
    name: String(company.data?.name ?? ''),
    primaryColor: value.primaryColor,
    secondaryColor: extras.secondaryColor,
    accentColor: value.accentColor,
    fontKey: value.fontKey,
    logoUrl: value.logoFileId ? `/api/portal/logo/${companyId}` : null,
    emailSignature: extras.emailSignature,
    clientFooter: extras.clientFooter,
    whiteLabel,
  };
}
