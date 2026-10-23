// path: services/portal/otp-session.ts
// After a client enters the one-time code, a short-lived signed cookie remembers it for this link only. The cookie holds
// the token id and an expiry; its signature uses the platform secret, so it cannot be made up or moved to another link.
import 'server-only';
import { cookies } from 'next/headers';
import { cookieSecure } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';
import { hmacSha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';

export const OTP_SESSION_SECONDS = 3600;

function cookieName(tokenId: string): string {
  return `kd_p_${tokenId.replace(/-/g, '').slice(0, 12)}`;
}

async function sign(secret: string, tokenId: string, expires: number): Promise<string> {
  return hmacSha256Hex(secret, `portal-otp:${tokenId}:${expires}`);
}

/** The cookie value for a link: "<expiry seconds>.<signature>". */
export async function makeOtpCookieValue(
  secret: string,
  tokenId: string,
  nowSeconds: number,
): Promise<string> {
  const expires = nowSeconds + OTP_SESSION_SECONDS;
  return `${expires}.${await sign(secret, tokenId, expires)}`;
}

/** True only for a value made for this link and not yet expired. */
export async function checkOtpCookieValue(
  secret: string,
  tokenId: string,
  raw: string | undefined,
  nowSeconds: number,
): Promise<boolean> {
  if (!raw) return false;
  const [expiresText = '', signature = ''] = raw.split('.');
  if (!/^\d{1,12}$/.test(expiresText) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (+expiresText <= nowSeconds) return false;
  return timingSafeEqualStrings(signature, await sign(secret, tokenId, +expiresText));
}

/** Sets the cookie; call from a route handler after a correct code. */
export async function grantOtpSession(tokenId: string): Promise<void> {
  const value = await makeOtpCookieValue(
    getServerEnv().HMAC_TOKEN_SECRET,
    tokenId,
    Math.floor(Date.now() / 1000),
  );
  (await cookies()).set(cookieName(tokenId), value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: OTP_SESSION_SECONDS,
  });
}

/** True when this request carries a valid cookie for the link. Outside a request it is false (closed). */
export async function hasOtpSession(tokenId: string): Promise<boolean> {
  try {
    const raw = (await cookies()).get(cookieName(tokenId))?.value;
    return await checkOtpCookieValue(
      getServerEnv().HMAC_TOKEN_SECRET,
      tokenId,
      raw,
      Math.floor(Date.now() / 1000),
    );
  } catch {
    return false;
  }
}
