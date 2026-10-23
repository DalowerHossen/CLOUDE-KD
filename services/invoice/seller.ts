// path: services/invoice/seller.ts
// The seller block frozen on an invoice when it is sent: company profile, branding, tax number, terms and the bank
// details to pay into. Later changes to the company profile never change an invoice that was sent.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { EMPTY_REMIT_TO, hasRemitTo, remitToSchema, type RemitTo } from '@/lib/invoice/remit';
import { getSection } from '@/services/company/settings';
import { getTaxSettings } from '@/services/tax/settings';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import type { EncryptedPayload } from '@/types/contracts';

export interface SellerBlock {
  name: string;
  legalName: string;
  taxLabel: string;
  taxId: string;
  registrationNumber: string;
  email: string;
  phone: string;
  website: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  logoFileId: string | null;
  primaryColor: string;
  accentColor: string;
  fontKey: string;
  terms: string;
  footer: string;
  remitTo: RemitTo | null;
}

export async function getRemitTo(companyId: string): Promise<RemitTo> {
  const { data, error } = await getAdminSupabase()
    .from('tax_settings')
    .select('remit_to_enc')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const enc = data?.remit_to_enc as EncryptedPayload | null | undefined;
  if (!enc) return EMPTY_REMIT_TO;
  const bytes = await getService('encryption').decrypt('pii', enc, companyId);
  const parsed = remitToSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data : EMPTY_REMIT_TO;
}

export async function saveRemitTo(actor: Actor, input: RemitTo): Promise<RemitTo> {
  if (!actor.companyId) throw new InternalError(new Error('A company is needed.'));
  const companyId = actor.companyId;
  const enc = await getService('encryption').encrypt('pii', JSON.stringify(input), companyId);
  const admin = getAdminSupabase();
  const upd = await admin
    .from('tax_settings')
    .update({ remit_to_enc: enc })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('company_id');
  if (upd.error) throw new InternalError(upd.error);
  if (!upd.data || upd.data.length === 0) {
    const ins = await admin
      .from('tax_settings')
      .insert({ company_id: companyId, remit_to_enc: enc });
    if (ins.error) throw new InternalError(ins.error);
  }
  await getService('audit').record({
    action: 'tax_settings.remit_to_saved',
    resourceType: 'tax_settings',
    resourceId: null,
    companyId,
    metadata: { by: actor.userId },
  });
  return input;
}

export async function buildSeller(companyId: string): Promise<SellerBlock> {
  const [profile, branding, invoice, tax, remit] = await Promise.all([
    getSection(companyId, 'profile'),
    getSection(companyId, 'branding'),
    getSection(companyId, 'invoice'),
    getTaxSettings(companyId),
    getRemitTo(companyId),
  ]);
  const p = profile.value;
  return {
    name: p.tradingName || p.legalName,
    legalName: p.legalName,
    taxLabel: tax.sellerTaxLabel,
    taxId: tax.sellerTaxId || p.taxId,
    registrationNumber: p.registrationNumber,
    email: p.email,
    phone: p.phone,
    website: p.website,
    line1: p.addressLine1,
    line2: p.addressLine2,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    logoFileId: branding.value.logoFileId,
    primaryColor: branding.value.primaryColor,
    accentColor: branding.value.accentColor,
    fontKey: branding.value.fontKey,
    terms: invoice.value.terms,
    footer: invoice.value.footer,
    remitTo: hasRemitTo(remit) ? remit : null,
  };
}
