// path: services/tax/exemptions.ts
// Tax exemption and tax number of a client, with the certificate file (kept through the storage contract).
import { toInt } from '@/lib/reports/numbers';
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ExemptionInput } from '@/lib/tax/input';
import { taxIdChecker } from '@/lib/tax/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface ExemptionView extends ExemptionInput {
  clientId: string;
  clientName: string;
  certificateFileId: string | null;
  clientTaxIdValid: boolean | null;
  clientTaxIdCheckedAt: string | null;
  /** Null until saved. */
  version: number | null;
}

const COLUMNS =
  'tax_exempt, reason, certificate_file_id, certificate_expires_on, client_tax_id, client_tax_label, client_tax_id_checked_at, client_tax_id_valid, version';

async function clientOf(
  companyId: string,
  clientId: string,
): Promise<{ name: string; country: string | null }> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('name, billing_country')
    .eq('id', clientId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    name: String(data.name),
    country: data.billing_country ? String(data.billing_country) : null,
  };
}

export async function getExemption(companyId: string, clientId: string): Promise<ExemptionView> {
  const client = await clientOf(companyId, clientId);
  const { data, error } = await getAdminSupabase()
    .from('client_tax_exemptions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const r = (data ?? null) as Record<string, unknown> | null;
  return {
    clientId,
    clientName: client.name,
    taxExempt: r?.tax_exempt === true,
    reason: String(r?.reason ?? ''),
    certificateExpiresOn: r?.certificate_expires_on ? String(r.certificate_expires_on) : null,
    clientTaxId: String(r?.client_tax_id ?? ''),
    clientTaxLabel: String(r?.client_tax_label ?? ''),
    certificateFileId: r?.certificate_file_id ? String(r.certificate_file_id) : null,
    clientTaxIdValid:
      r?.client_tax_id_valid === null || r === null ? null : r?.client_tax_id_valid === true,
    clientTaxIdCheckedAt: r?.client_tax_id_checked_at ? String(r.client_tax_id_checked_at) : null,
    version: r ? toInt(r.version, 1) : null,
  };
}

export async function saveExemption(
  actor: Actor,
  clientId: string,
  expectedVersion: number | null,
  input: ExemptionInput,
): Promise<ExemptionView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const client = await clientOf(companyId, clientId);
  const admin = getAdminSupabase();
  const columns: Record<string, unknown> = {
    tax_exempt: input.taxExempt,
    reason: input.reason,
    certificate_expires_on: input.certificateExpiresOn,
    client_tax_id: input.clientTaxId,
    client_tax_label: input.clientTaxLabel,
  };
  // The tax number is checked with the registered service (VIES or similar) when there is one.
  const check = taxIdChecker();
  if (check && input.clientTaxId && client.country) {
    const result = await check(client.country, input.clientTaxId).catch(() => null);
    columns.client_tax_id_checked_at = result ? new Date().toISOString() : null;
    columns.client_tax_id_valid = result ? result.valid : null;
  } else if (!input.clientTaxId) {
    columns.client_tax_id_checked_at = null;
    columns.client_tax_id_valid = null;
  }
  if (expectedVersion === null) {
    const { error } = await admin
      .from('client_tax_exemptions')
      .insert({ company_id: companyId, client_id: clientId, ...columns });
    if (error) {
      if (error.code === '23505') throw new ConflictError();
      throw new InternalError(error);
    }
  } else {
    const r = await admin
      .from('client_tax_exemptions')
      .update(columns)
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .eq('version', expectedVersion)
      .is('deleted_at', null)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'client_tax_exemption.saved',
    resourceType: 'client',
    resourceId: clientId,
    companyId,
    metadata: { taxExempt: input.taxExempt, by: actor.userId },
  });
  return getExemption(companyId, clientId);
}

export async function saveCertificate(
  actor: Actor,
  clientId: string,
  upload: { name: string; mimeType: string; dataBase64: string },
): Promise<{ fileId: string }> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  await clientOf(companyId, clientId);
  const current = await getExemption(companyId, clientId);
  if (current.version === null)
    throw new ValidationError('Save the exemption first, then add the certificate.');
  const storage = getService('storage');
  const record = await storage.put({
    companyId,
    category: 'attachment',
    name: upload.name,
    bytes: new Uint8Array(Buffer.from(upload.dataBase64, 'base64')),
    mimeType: upload.mimeType,
  });
  const r = await getAdminSupabase()
    .from('client_tax_exemptions')
    .update({ certificate_file_id: record.id })
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .eq('version', current.version)
    .is('deleted_at', null)
    .select('id');
  if (r.error || !r.data || r.data.length === 0) {
    await storage.remove(record.id).catch(() => undefined);
    if (r.error) throw new InternalError(r.error);
    throw new ConflictError();
  }
  if (current.certificateFileId)
    await storage.remove(current.certificateFileId).catch(() => undefined);
  await getService('audit').record({
    action: 'client_tax_exemption.certificate_added',
    resourceType: 'client',
    resourceId: clientId,
    companyId,
    metadata: { by: actor.userId },
  });
  return { fileId: record.id };
}

export async function readCertificate(
  companyId: string,
  clientId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const current = await getExemption(companyId, clientId);
  if (!current.certificateFileId) throw new NotFoundError();
  const file = await getService('storage').get(current.certificateFileId);
  if (file.record.companyId !== companyId) throw new NotFoundError();
  return { bytes: file.bytes, mimeType: file.record.mimeType };
}
