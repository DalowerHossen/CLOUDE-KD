// path: lib/auth/tokens.ts
// Access tokens for tokenized links. A token is "<128-bit random id>.<signature>". The signature is the first 128 bits of
// HMAC-SHA256 over the id, so a changed or invented token is rejected before any database lookup. Only the SHA-256 hash of
// the whole token is stored. Pure functions: the secret is passed in.
import {
  base64UrlEncode,
  hmacSha256Bytes,
  randomBytes,
  sha256Hex,
  timingSafeEqualStrings,
} from '@/lib/utils/hash';

export const ALLOWED_TTL_DAYS: readonly number[] = [7, 30, 90, 365];
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MINUTES = 15;

const TOKEN_RE = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

async function sign(idPart: string, secret: string): Promise<string> {
  const mac = await hmacSha256Bytes(secret, `access-token:${idPart}`);
  return base64UrlEncode(mac.slice(0, 16));
}

export async function generateToken(secret: string): Promise<{ token: string; hash: string }> {
  const idPart = base64UrlEncode(randomBytes(16));
  const token = `${idPart}.${await sign(idPart, secret)}`;
  return { token, hash: await sha256Hex(token) };
}

/** True only for a well-formed token whose signature was made with this secret. */
export async function hasValidSignature(token: string, secret: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const [idPart = '', signature = ''] = token.split('.');
  return timingSafeEqualStrings(signature, await sign(idPart, secret));
}

export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** For logs and analytics: never the whole token. */
export function maskToken(token: string): string {
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}...${token.slice(-2)}`;
}

/** Longest allowed lifetime not above the request and not above the plan limit. */
export function normalizeTtlDays(requested: number, planLimit: number | null | undefined): number {
  const ceiling = typeof planLimit === 'number' ? planLimit : Math.max(...ALLOWED_TTL_DAYS);
  const fits = ALLOWED_TTL_DAYS.filter((d) => d <= Math.min(requested, ceiling));
  return fits.length > 0 ? Math.max(...fits) : Math.min(...ALLOWED_TTL_DAYS);
}

/** Six digits, uniformly random. */
export function generateOtp(): string {
  const limit = 4_294_967_296 - (4_294_967_296 % 1_000_000);
  for (;;) {
    const b = randomBytes(4);
    const n =
      ((b[0] ?? 0) * 16_777_216 + (b[1] ?? 0) * 65_536 + (b[2] ?? 0) * 256 + (b[3] ?? 0)) >>> 0;
    if (n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

export async function hashOtp(code: string, tokenId: string, secret: string): Promise<string> {
  const mac = await hmacSha256Bytes(secret, `otp:${tokenId}:${code}`);
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}
