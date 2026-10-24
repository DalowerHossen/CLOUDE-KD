// path: services/gateway/kyc-links.ts
// The secure link of a sub-merchant's KYC. The link is 40 random characters, shown once; only its hash is stored. A new link
// replaces the earlier ones. A wrong, expired or revoked link and the link of a sub-merchant that is not active all look the same.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { KYC_TOKEN_SHAPE, hashKycToken, kycLinkInput, makeKycToken } from '@/lib/gateway/kyc-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { getSubMerchant } from './sub-merchants';

export interface ResolvedLink {
  linkId: string;
  companyId: string;
  subMerchantId: string;
  subMerchantName: string;
}

export async function createKycLink(
  actor: Actor,
  subMerchantId: string,
  input: unknown,
): Promise<{ token: string; path: string; expiresAt: string }> {
  const companyId = need(actor);
  const parsed = kycLinkInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The link is not valid.');
  const sub = await getSubMerchant(companyId, subMerchantId);
  if (sub.status !== 'active')
    throw new ConflictError('Only an active sub-merchant can get a link.');
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const revoked = await admin
    .from('sub_merchant_kyc_links')
    .update({ revoked_at: now })
    .eq('company_id', companyId)
    .eq('sub_merchant_id', subMerchantId)
    .is('revoked_at', null);
  if (revoked.error) mapIntegrationError(revoked.error);
  const token = makeKycToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('sub_merchant_kyc_links')
    .insert({
      company_id: companyId,
      sub_merchant_id: subMerchantId,
      token_hash: await hashKycToken(token),
      expires_at: expiresAt,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) mapIntegrationError(error);
  await record(companyId, 'gateway.kyc_link_created', 'sub_merchant_kyc_link', String(data.id), {
    subMerchantId,
    expiresAt,
  });
  return { token, path: `/skyc/${token}`, expiresAt };
}

/**
 * The link behind a token, or null for every kind of failure (wrong shape, unknown, expired, revoked, sub-merchant not active,
 * too many tries). Requests are limited per address and per link.
 */
export async function resolveKycLink(token: string, ip: string): Promise<ResolvedLink | null> {
  if (!KYC_TOKEN_SHAPE.test(token)) return null;
  const hash = await hashKycToken(token);
  const security = getService('security');
  const byAddress = await security.rateLimit(`smkyc:ip:${ip}`, 'auth');
  const byLink = await security.rateLimit(`smkyc:link:${hash.slice(0, 24)}`, 'auth');
  if (!byAddress.allowed || !byLink.allowed) return null;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('sub_merchant_kyc_links')
    .select('id, company_id, sub_merchant_id, expires_at, revoked_at')
    .eq('token_hash', hash)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || data.revoked_at !== null || Date.parse(String(data.expires_at)) <= Date.now())
    return null;
  const sub = await admin
    .from('sub_merchants')
    .select('id, name, status')
    .eq('company_id', String(data.company_id))
    .eq('id', String(data.sub_merchant_id))
    .is('deleted_at', null)
    .maybeSingle();
  if (sub.error) throw new InternalError(sub.error);
  if (!sub.data || sub.data.status !== 'active') return null;
  await admin
    .from('sub_merchant_kyc_links')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', String(data.id))
    .eq('company_id', String(data.company_id));
  return {
    linkId: String(data.id),
    companyId: String(data.company_id),
    subMerchantId: String(data.sub_merchant_id),
    subMerchantName: String(sub.data.name),
  };
}
