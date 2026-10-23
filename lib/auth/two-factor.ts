// path: lib/auth/two-factor.ts
// TOTP and backup code helpers. Pure functions: no database, no environment.
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import { BACKUP_CODE_COUNT, TOTP_PERIOD_SECONDS, TOTP_WINDOW_STEPS } from '@/config/auth-lock';
import { randomInt } from 'node:crypto';
import { hmacSha256Hex } from '@/lib/utils/hash';

const TOTP_OPTIONS = { period: TOTP_PERIOD_SECONDS, digits: 6 } as const;

export const ISSUER = 'KD SOLUTION IT';

export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function buildOtpAuthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret, ...TOTP_OPTIONS });
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
  const result = verifySync({
    secret,
    token: clean,
    ...TOTP_OPTIONS,
    epoch: Math.floor(nowMs / 1000),
    epochTolerance: TOTP_WINDOW_STEPS * TOTP_PERIOD_SECONDS,
  });
  if (!result.valid) return { ok: false, step: null };
  const step = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS) + result.delta;
  if (step <= lastUsedStep) return { ok: false, step: null };
  return { ok: true, step };
}

export function currentTotp(secret: string): string {
  return generateSync({ secret, ...TOTP_OPTIONS });
}

// Letters and digits without look-alikes (no 0, O, 1, I, L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Ten codes like "K7MQ2-9XTHB". About 50 bits each. They are shown once and stored only as keyed hashes. */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    let raw = '';
    for (let i = 0; i < 10; i += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
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
