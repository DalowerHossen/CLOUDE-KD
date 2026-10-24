// path: services/gateway/db.ts
// Shared helpers of the gateway services: the audit entry and the sealing of the signing secret (purpose `oauth-tokens`, scoped to
// the company).
import 'server-only';
import { getService } from '@/lib/container';
import { ValidationError } from '@/lib/errors';
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
