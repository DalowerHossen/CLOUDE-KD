// path: services/portal/access.ts
// The one door of every client page. It limits requests per address and per link (10 a minute each), asks the tokens
// contract about the link, and returns a state. Every state that is not "ok" or "otp" carries no data about the document:
// a wrong link, a link of another document type and an unknown link all look the same ("invalid").
import 'server-only';
import { getService } from '@/lib/container';
import { hasValidSignature, hashToken } from '@/lib/auth/tokens';
import { getServerEnv } from '@/lib/env';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { TokenDocumentType } from '@/types/contracts';
import { tenantForRequest } from '@/services/branding/domain';
import { hasOtpSession } from './otp-session';
import { recordPortalEvent, type PortalSubject } from './events';

export type PortalAccess =
  | ({ state: 'ok'; otpRequired: boolean } & PortalSubject)
  | ({ state: 'otp' } & PortalSubject)
  | { state: 'expired' | 'revoked' | 'invalid' | 'limited' };

/** Pages of the portal and the document type each one serves. */
export const PORTAL_ROUTES: Readonly<Record<string, TokenDocumentType>> = {
  i: 'invoice',
  pay: 'payment',
  e: 'estimate',
  r: 'receipt',
  hub: 'hub',
  c: 'contract',
};

export async function resolvePortalAccess(
  token: string,
  allowed: readonly TokenDocumentType[],
): Promise<PortalAccess> {
  const security = getService('security');
  const meta = await readRequestMeta();
  const tokenKey = (await hashToken(token)).slice(0, 24);
  const byAddress = await security.rateLimit(`portal:ip:${meta.ipHash ?? 'unknown'}`, 'auth');
  const byLink = await security.rateLimit(`portal:token:${tokenKey}`, 'auth');
  if (!byAddress.allowed || !byLink.allowed) return { state: 'limited' };
  const checked = await getService('tokens').verify(token);
  if (!checked.valid) return { state: checked.reason };
  if (!allowed.includes(checked.docType)) return { state: 'invalid' };
  // A company's own domain serves that company's links only; a link of another company looks like any wrong link.
  const hostCompany = await tenantForRequest().catch(() => null);
  if (hostCompany && hostCompany !== checked.companyId) return { state: 'invalid' };
  const subject: PortalSubject = {
    tokenId: checked.id,
    companyId: checked.companyId,
    docType: checked.docType,
    docId: checked.docId,
  };
  if (checked.otpRequired && !(await hasOtpSession(checked.id)))
    return { state: 'otp', ...subject };
  return { state: 'ok', otpRequired: checked.otpRequired, ...subject };
}

/** The token string is well formed and was signed by this platform (no database access). */
export async function isPlatformToken(token: string): Promise<boolean> {
  return hasValidSignature(token, getServerEnv().HMAC_TOKEN_SECRET);
}

export { recordPortalEvent };
