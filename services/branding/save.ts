// path: services/branding/save.ts
// Changing the brand: save (with the contrast check), reset to the platform look, export and import as JSON, and the
// history of changes. The colours, font and logo live in the `branding` settings section (STEP 07); the rest lives in
// `tenant_branding`. Every change is written to `branding_history`.
import 'server-only';
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { FONT_KEYS, SECTION_DEFAULTS } from '@/lib/company/sections';
import { sanitizeBodyHtml } from '@/lib/email/template-body';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection, saveSection } from '@/services/company/settings';
import type { Actor } from '@/types/contracts';
import { DEFAULT_EXTRAS, getExtras, getTenantBrand } from './brand';
import { checkBrandColors, DEFAULT_SECONDARY } from '@/lib/branding/theme';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex value such as #1d4ed8.');

export const brandingInputSchema = z
  .object({
    primaryColor: hex,
    secondaryColor: hex,
    accentColor: hex,
    fontKey: z.enum(FONT_KEYS),
    emailSignature: z.string().max(2000),
    clientFooter: plain(0, 500),
  })
  .strict();
export type BrandingInput = z.infer<typeof brandingInputSchema>;

/** The file a company can export and import. The logo is not part of it (it is a stored file). */
export const brandingFileSchema = z
  .object({ kind: z.literal('kd-branding'), version: z.literal(1), brand: brandingInputSchema })
  .strict();

export const saveBodySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    brand: brandingInputSchema,
  })
  .strict();
export const importBodySchema = z
  .object({ expectedVersion: z.number().int().min(0), file: brandingFileSchema })
  .strict();

export interface BrandingView {
  brand: BrandingInput;
  logoUrl: string | null;
  whiteLabel: boolean;
  /** Version of the settings section; send it back when saving. */
  version: number;
}

async function current(companyId: string): Promise<BrandingInput> {
  const brand = await getTenantBrand(companyId);
  return {
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    accentColor: brand.accentColor,
    fontKey: brand.fontKey,
    emailSignature: brand.emailSignature,
    clientFooter: brand.clientFooter,
  };
}

export async function getBrandingView(companyId: string): Promise<BrandingView> {
  const [brand, section] = await Promise.all([
    getTenantBrand(companyId),
    getSection(companyId, 'branding'),
  ]);
  return {
    brand: await current(companyId),
    logoUrl: brand.logoUrl,
    whiteLabel: brand.whiteLabel,
    version: section.version,
  };
}

export async function exportBranding(
  companyId: string,
): Promise<z.infer<typeof brandingFileSchema>> {
  return { kind: 'kd-branding', version: 1, brand: await current(companyId) };
}

async function writeHistory(
  actor: Actor,
  action: 'save' | 'reset' | 'import',
  before: BrandingInput,
  after: BrandingInput,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('branding_history')
    .insert({ company_id: actor.companyId, action, changed_by: actor.userId, before, after });
  if (error) throw new InternalError(error);
}

async function apply(
  actor: Actor,
  action: 'save' | 'reset' | 'import',
  input: BrandingInput,
  expectedVersion: number,
  checkColors: boolean,
): Promise<BrandingView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (checkColors) {
    const issues = checkBrandColors(input);
    if (issues.length > 0)
      throw new ValidationError(
        issues[0]?.message ?? 'A colour is not valid.',
        issues.map((i) => ({ path: i.field, message: i.message })),
      );
  }
  const before = await current(companyId);
  const signature = sanitizeBodyHtml(input.emailSignature, { allowPlaceholderUri: false });
  const section = await getSection(companyId, 'branding');
  if (section.version !== expectedVersion)
    throw new ConflictError('The branding was changed by someone else. Reload and try again.');
  await saveSection(
    actor,
    'branding',
    {
      ...section.value,
      primaryColor: input.primaryColor,
      accentColor: input.accentColor,
      fontKey: input.fontKey,
    },
    section.version,
  );
  const extras = await getExtras(companyId);
  const row = {
    company_id: companyId,
    secondary_color: input.secondaryColor,
    email_signature: signature,
    client_footer: input.clientFooter,
  };
  const admin = getAdminSupabase();
  const written =
    extras.version === 0
      ? await admin.from('tenant_branding').insert(row)
      : await admin
          .from('tenant_branding')
          .update(row)
          .eq('company_id', companyId)
          .eq('version', extras.version);
  if (written.error) throw new InternalError(written.error);
  await writeHistory(actor, action, before, { ...input, emailSignature: signature });
  return getBrandingView(companyId);
}

export function saveBranding(
  actor: Actor,
  input: BrandingInput,
  expectedVersion: number,
): Promise<BrandingView> {
  return apply(actor, 'save', input, expectedVersion, true);
}

export function importBranding(
  actor: Actor,
  file: z.infer<typeof brandingFileSchema>,
  expectedVersion: number,
): Promise<BrandingView> {
  return apply(actor, 'import', file.brand, expectedVersion, true);
}

/** Back to the platform look: default colours and font, no signature, no footer. The logo stays. */
export function resetBranding(actor: Actor, expectedVersion: number): Promise<BrandingView> {
  const base = SECTION_DEFAULTS.branding;
  return apply(
    actor,
    'reset',
    {
      primaryColor: base.primaryColor,
      secondaryColor: DEFAULT_SECONDARY,
      accentColor: base.accentColor,
      fontKey: base.fontKey,
      emailSignature: DEFAULT_EXTRAS.emailSignature,
      clientFooter: DEFAULT_EXTRAS.clientFooter,
    },
    expectedVersion,
    false,
  );
}

export interface HistoryRow {
  id: string;
  action: string;
  changedBy: string | null;
  at: string;
  before: unknown;
  after: unknown;
}

export async function listBrandingHistory(companyId: string, limit = 50): Promise<HistoryRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('branding_history')
    .select('id, action, changed_by, created_at, before, after')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    action: String(r.action),
    changedBy: r.changed_by ? String(r.changed_by) : null,
    at: String(r.created_at),
    before: r.before,
    after: r.after,
  }));
}
