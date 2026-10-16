// path: lib/auth/two-factor.ts
// TOTP and backup code helpers. Pure functions: no database, no environment.
import { authenticator } from 'otplib';
import { BACKUP_CODE_COUNT, TOTP_PERIOD_SECONDS, TOTP_WINDOW_STEPS } from '@/config/auth-lock';
import { hmacSha256Hex, randomBytes } from '@/lib/utils/hash';

authenticator.options = { step: TOTP_PERIOD_SECONDS, window: TOTP_WINDOW_STEPS, digits: 6 };

export const ISSUER = 'KD SOLUTION IT';

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function buildOtpAuthUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/** Groups a secret in blocks of four for manual entry. */
export function formatSecretForManualEntry(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export interface TotpResult {
  ok: boolean;
  /** Time step that matched. Store it and refuse the same or an older step next time (replay protection). */
  step: number | null;
}

export function verifyTotp(
  secret: string,
  code: string,
  lastUsedStep: number,
  nowMs: number = Date.now(),
): TotpResult {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false, step: null };
  const delta = authenticator.checkDelta(clean, secret);
  if (delta === null) return { ok: false, step: null };
  const step = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS) + delta;
  if (step <= lastUsedStep) return { ok: false, step: null };
  return { ok: true, step };
}

export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}

// Letters and digits without look-alikes (no 0, O, 1, I, L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Ten codes like "K7MQ2-9XTHB". About 50 bits each. They are shown once and stored only as keyed hashes. */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    const bytes = randomBytes(10);
    let raw = '';
    for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase();
}

export async function hashBackupCode(code: string, key: string): Promise<string> {
  return hmacSha256Hex(key, `backup:${normalizeBackupCode(code)}`);
}

export function looksLikeBackupCode(code: string): boolean {
  return /^[A-Z2-9]{10}$/.test(normalizeBackupCode(code)) && !/^\d{6}$/.test(code.trim());
}
