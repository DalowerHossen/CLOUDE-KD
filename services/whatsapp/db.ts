// path: services/whatsapp/db.ts
// Shared helpers of the WhatsApp services: the audit entry, secret sealing, and the account with its decrypted credentials.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { Credentials } from '@/lib/whatsapp/client';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';

export const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

export async function record(
  companyId: string,
  action: string,
  type: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: type,
    resourceId: id,
    companyId,
    metadata,
  });
}

export const seal = (companyId: string, secret: string): Promise<EncryptedPayload> =>
  getService('encryption').encrypt('oauth-tokens', secret, companyId);

export async function open(companyId: string, payload: EncryptedPayload): Promise<string> {
  return new TextDecoder().decode(
    await getService('encryption').decrypt('oauth-tokens', payload, companyId),
  );
}

export interface AccountRow {
  id: string;
  company_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string;
  verified_name: string;
  quality_rating: string;
  access_token_enc: EncryptedPayload;
  access_token_last4: string;
  app_secret_enc: EncryptedPayload;
  webhook_key: string;
  verify_token_hash: string;
  sandbox: boolean;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
  version: number;
}

export const ACCOUNT_COLUMNS =
  'id, company_id, waba_id, phone_number_id, display_phone, verified_name, quality_rating, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash, sandbox, status, last_checked_at, last_error, version';

export async function accountRow(companyId: string): Promise<AccountRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as unknown as AccountRow | null) ?? null;
}

export async function requireAccount(companyId: string): Promise<AccountRow> {
  const row = await accountRow(companyId);
  if (!row) throw new NotFoundError('WhatsApp is not set up yet.');
  return row;
}

export async function credentialsOf(row: AccountRow): Promise<Credentials> {
  return {
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    accessToken: await open(row.company_id, row.access_token_enc),
  };
}
