// path: services/encryption/encryption-service.ts
// The `encryption` contract: AES-256-GCM with per-purpose, per-scope data keys derived from environment keys.
import 'server-only';
import { decryptBytes, encryptBytes } from '@/lib/encryption/aead';
import { blindIndex } from '@/lib/encryption/blind-index';
import { createLogger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptedPayload, EncryptionPurpose, EncryptionService } from '@/types/contracts';
import { activeKeyVersion, rootKeys } from './keys';

const log = createLogger({ component: 'encryption' });

/** Purposes whose reads are recorded in secret_access_log. Files and PII are too frequent to log one by one. */
const AUDITED: ReadonlySet<EncryptionPurpose> = new Set([
  'processor-credentials',
  'oauth-tokens',
  'kyc',
]);

async function recordAccess(
  purpose: EncryptionPurpose,
  operation: 'decrypt' | 'encrypt',
  keyVersion: number,
): Promise<void> {
  if (!AUDITED.has(purpose)) return;
  const context = getContext();
  try {
    const { error } = await getAdminSupabase()
      .from('secret_access_log')
      .insert({
        company_id: context?.companyId ?? null,
        purpose,
        operation,
        key_version: keyVersion,
        actor_user_id: context?.actorId ?? null,
        correlation_id: context?.correlationId ?? null,
      });
    if (error) throw error;
  } catch (error) {
    // The secret was already used; the failure is logged and does not reveal anything.
    log.error('secret access could not be recorded', { purpose, error });
  }
}

export interface ExtendedEncryptionService extends EncryptionService {
  /** Keyed hash for equality search on an encrypted field. Always uses key version 1 so it never changes. */
  blindIndex(field: string, value: string): string;
  activeVersion(): number;
}

export function createEncryptionService(): ExtendedEncryptionService {
  return {
    async encrypt(purpose, plaintext, scope = ''): Promise<EncryptedPayload> {
      const version = activeKeyVersion();
      const bytes = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
      const payload = encryptBytes(rootKeys(), version, purpose, bytes, scope);
      await recordAccess(purpose, 'encrypt', version);
      return payload;
    },
    async decrypt(purpose, payload, scope = ''): Promise<Uint8Array> {
      const out = decryptBytes(rootKeys(), purpose, payload, scope);
      await recordAccess(purpose, 'decrypt', payload.keyVersion);
      return out;
    },
    blindIndex: (field, value) => blindIndex(rootKeys(), 1, field, value),
    activeVersion: activeKeyVersion,
  };
}
