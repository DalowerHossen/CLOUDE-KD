// path: services/integration/commerce-db.ts
// Shared helpers of the commerce services: the audit entry, the sealing of store credentials (purpose `oauth-tokens`, scoped to the
// company), the sync log line, and the actor an automatic sync works as.
import 'server-only';
import { getService } from '@/lib/container';
import { ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';

const log = createLogger({ component: 'commerce' });

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

export type LogEvent =
  | 'connect'
  | 'webhook'
  | 'order'
  | 'client'
  | 'invoice'
  | 'mapping'
  | 'conflict'
  | 'refund'
  | 'retry'
  | 'check';

/** Writes one line of the sync log. A failure to write the log never stops the work it describes. */
export async function writeLog(
  companyId: string,
  integrationId: string,
  orderId: string | null,
  event: LogEvent,
  level: 'info' | 'warn' | 'error',
  message: string,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('integration_sync_log')
    .insert({
      company_id: companyId,
      integration_id: integrationId,
      order_id: orderId,
      event,
      level,
      message: message.slice(0, 300),
    });
  if (error) log.warn('sync log line was not written', { code: error.code });
}

/** The actor an automatic sync works as: the owner who connected the store, so the client is made without waiting for approval. */
export function syncActor(companyId: string, createdBy: string | null): Actor {
  return {
    userId: createdBy ?? '00000000-0000-0000-0000-000000000000',
    role: 'owner',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'commerce-sync',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}
