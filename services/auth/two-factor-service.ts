// path: services/auth/two-factor-service.ts
// TOTP enrollment, verification, backup codes. Seeds are encrypted through the encryption contract; backup codes are
// stored as keyed hashes. Every wrong code is the caller's job to feed into the lock engine.
import 'server-only';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  buildOtpAuthUri,
  formatSecretForManualEntry,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  looksLikeBackupCode,
  verifyTotp,
} from '@/lib/auth/two-factor';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptedPayload } from '@/types/contracts';
import { pepper } from './credentials';

const payloadSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  keyVersion: z.number().int(),
});
const factorRow = z
  .object({
    id: z.string().uuid(),
    secret_encrypted: payloadSchema,
    status: z.enum(['pending', 'active', 'disabled']),
    last_used_step: z.coerce.number(),
  })
  .strip();

export interface EnrollmentStart {
  secret: string;
  manualCode: string;
  otpauthUri: string;
  qrDataUrl: string;
}

type FactorRow = z.infer<typeof factorRow>;

async function loadFactor(userId: string, status: 'pending' | 'active'): Promise<FactorRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('two_factor_factors')
    .select('id, secret_encrypted, status, last_used_step')
    .eq('user_id', userId)
    .eq('status', status)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? factorRow.parse(data) : null;
}

async function decryptSecret(userId: string, payload: EncryptedPayload): Promise<string> {
  const bytes = await getService('encryption').decrypt('pii', payload, userId);
  return new TextDecoder().decode(bytes);
}

export async function isTwoFactorActive(userId: string): Promise<boolean> {
  return (await loadFactor(userId, 'active')) !== null;
}

/** Starts (or restarts) enrollment. An active factor must be disabled first. */
export async function beginEnrollment(
  userId: string,
  companyId: string | null,
  email: string,
): Promise<EnrollmentStart> {
  if (await loadFactor(userId, 'active'))
    throw new ConflictError('Two-factor authentication is already on.');
  const admin = getAdminSupabase();
  await admin.from('two_factor_factors').delete().eq('user_id', userId).eq('status', 'pending');
  const secret = generateTotpSecret();
  const encrypted = await getService('encryption').encrypt('pii', secret, userId);
  const { error } = await admin.from('two_factor_factors').insert({
    user_id: userId,
    company_id: companyId,
    secret_encrypted: encrypted,
    status: 'pending',
  });
  if (error) throw new InternalError(error);
  const uri = buildOtpAuthUri(email, secret);
  return {
    secret,
    manualCode: formatSecretForManualEntry(secret),
    otpauthUri: uri,
    qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' }),
  };
}

/** Confirms enrollment with the first code. Returns the 10 backup codes (shown once). */
export async function confirmEnrollment(
  userId: string,
  companyId: string | null,
  code: string,
): Promise<string[] | null> {
  const factor = await loadFactor(userId, 'pending');
  if (!factor) throw new NotFoundError();
  const secret = await decryptSecret(userId, factor.secret_encrypted);
  const result = verifyTotp(secret, code, 0);
  if (!result.ok || result.step === null) return null;
  const admin = getAdminSupabase();
  const updated = await admin
    .from('two_factor_factors')
    .update({
      status: 'active',
      verified_at: new Date().toISOString(),
      last_used_step: result.step,
    })
    .eq('id', factor.id)
    .eq('status', 'pending');
  if (updated.error) throw new InternalError(updated.error);
  return storeNewBackupCodes(userId, companyId);
}

export async function storeNewBackupCodes(
  userId: string,
  companyId: string | null,
): Promise<string[]> {
  const admin = getAdminSupabase();
  const codes = generateBackupCodes();
  await admin.from('backup_codes').delete().eq('user_id', userId);
  const rows = await Promise.all(
    codes.map(async (c) => ({
      user_id: userId,
      company_id: companyId,
      code_hash: await hashBackupCode(c, pepper()),
    })),
  );
  const { error } = await admin.from('backup_codes').insert(rows);
  if (error) throw new InternalError(error);
  return codes;
}

export async function remainingBackupCodes(userId: string): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from('backup_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return count ?? 0;
}

export interface CodeCheck {
  ok: boolean;
  usedBackupCode: boolean;
}

/** Checks a TOTP code or a backup code. A used code never works twice. */
export async function verifySecondFactor(userId: string, code: string): Promise<CodeCheck> {
  const admin = getAdminSupabase();
  if (looksLikeBackupCode(code)) {
    const { data, error } = await admin
      .from('backup_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('code_hash', await hashBackupCode(code, pepper()))
      .is('used_at', null)
      .is('deleted_at', null)
      .select('id');
    if (error) throw new InternalError(error);
    return { ok: (data ?? []).length === 1, usedBackupCode: true };
  }
  const factor = await loadFactor(userId, 'active');
  if (!factor) return { ok: false, usedBackupCode: false };
  const result = verifyTotp(
    await decryptSecret(userId, factor.secret_encrypted),
    code,
    factor.last_used_step,
  );
  if (!result.ok || result.step === null) return { ok: false, usedBackupCode: false };
  // Compare-and-set on the step: two parallel requests with the same code cannot both succeed.
  const updated = await admin
    .from('two_factor_factors')
    .update({ last_used_step: result.step })
    .eq('id', factor.id)
    .lt('last_used_step', result.step)
    .select('id');
  if (updated.error) throw new InternalError(updated.error);
  return { ok: (updated.data ?? []).length === 1, usedBackupCode: false };
}

/** Turns 2FA off (owner with confirmation, or recovery by backup code). The next sign-in asks for a new setup. */
export async function disableTwoFactor(userId: string): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin
    .from('two_factor_factors')
    .update({ status: 'disabled' })
    .eq('user_id', userId)
    .in('status', ['active', 'pending']);
  if (error) throw new InternalError(error);
  await admin.from('backup_codes').delete().eq('user_id', userId);
}
