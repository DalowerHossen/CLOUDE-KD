// path: services/gateway/sub-merchants.ts
// The sub-merchants of a company. A sub-merchant has a reference (sent to the main merchant's app), a state and, optionally, a subset
// of the routes. A suspended sub-merchant is stopped at once; a closed one is stopped for good and its keys are revoked.
import 'server-only';
import { GATEWAY_MAX_SUB_MERCHANTS } from '@/config/s16-gateway';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { verifiedUntil } from '@/lib/gateway/kyc-rules';
import { subMerchantInput, subMerchantUpdate } from '@/lib/gateway/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

const COLUMNS =
  'id, name, reference, contact_email, status, route_ids, note, kyc_approved_until, version, created_at, updated_at';

interface Row {
  id: string;
  name: string;
  reference: string;
  contact_email: string | null;
  status: string;
  route_ids: string[] | null;
  note: string;
  kyc_approved_until: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type SubMerchantStatus = 'active' | 'suspended' | 'closed';

export interface SubMerchantView {
  id: string;
  name: string;
  reference: string;
  contactEmail: string | null;
  status: SubMerchantStatus;
  routeIds: string[] | null;
  note: string;
  kycApprovedUntil: string | null;
  /** True while the verification (KYC) is valid. */
  kycVerified: boolean;
  version: number;
  createdAt: string;
}

const toView = (r: Row): SubMerchantView => ({
  id: r.id,
  name: r.name,
  reference: r.reference,
  contactEmail: r.contact_email,
  status: r.status === 'suspended' ? 'suspended' : r.status === 'closed' ? 'closed' : 'active',
  routeIds: r.route_ids,
  note: r.note,
  kycApprovedUntil: r.kyc_approved_until,
  kycVerified: verifiedUntil(r.kyc_approved_until, new Date()),
  version: r.version,
  createdAt: r.created_at,
});

export async function listSubMerchants(companyId: string): Promise<SubMerchantView[]> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchants')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(GATEWAY_MAX_SUB_MERCHANTS + 1);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function getSubMerchant(companyId: string, id: string): Promise<SubMerchantView> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchants')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

/** Route ids must be routes of this company. */
async function checkRouteIds(companyId: string, ids: string[] | null | undefined): Promise<void> {
  if (!ids || ids.length === 0) return;
  const { data, error } = await getAdminSupabase()
    .from('gateway_routes')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('id', ids);
  if (error) throw new InternalError(error);
  if ((data ?? []).length !== new Set(ids).size)
    throw new ValidationError('A route in the list was not found.');
}

export async function createSubMerchant(actor: Actor, input: unknown): Promise<SubMerchantView> {
  const companyId = need(actor);
  const parsed = subMerchantInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The sub-merchant is not valid.');
  const d = parsed.data;
  if ((await listSubMerchants(companyId)).length >= GATEWAY_MAX_SUB_MERCHANTS)
    throw new ConflictError(
      `A company can have ${GATEWAY_MAX_SUB_MERCHANTS} sub-merchants at most.`,
    );
  await checkRouteIds(companyId, d.routeIds);
  const { data, error } = await getAdminSupabase()
    .from('sub_merchants')
    .insert({
      company_id: companyId,
      name: d.name,
      reference: d.reference,
      contact_email: d.contactEmail,
      route_ids: d.routeIds,
      note: d.note,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data as unknown as Row);
  await record(companyId, 'gateway.sub_merchant_created', 'sub_merchant', view.id, {
    reference: view.reference,
  });
  return view;
}

export async function updateSubMerchant(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<SubMerchantView> {
  const companyId = need(actor);
  const parsed = subMerchantUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await getSubMerchant(companyId, id);
  if (current.status === 'closed') throw new ConflictError('A closed sub-merchant cannot change.');
  await checkRouteIds(companyId, d.routeIds);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.contactEmail !== undefined) patch.contact_email = d.contactEmail;
  if (d.status !== undefined) patch.status = d.status;
  if (d.routeIds !== undefined) patch.route_ids = d.routeIds;
  if (d.note !== undefined) patch.note = d.note;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('sub_merchants')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0)
    throw new ConflictError('The sub-merchant changed. Reload and try again.');
  if (d.status === 'closed') {
    const revoked = await admin
      .from('sub_merchant_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('sub_merchant_id', id)
      .is('revoked_at', null);
    if (revoked.error) mapIntegrationError(revoked.error);
  }
  await record(companyId, 'gateway.sub_merchant_changed', 'sub_merchant', id, {
    fields: Object.keys(patch),
    status: d.status ?? null,
  });
  return toView(data[0] as unknown as Row);
}
