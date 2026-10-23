// path: lib/middleware/idempotency.ts
// Generic idempotency wrapper for code that is not behind withApi (webhook handlers, workers). The first call runs
// the function and stores its answer; a repeat with the same key and the same request returns the stored answer.
import { getService } from '@/lib/container';
import { ConflictError, IdempotencyConflictError } from '@/lib/errors';
import { sha256Hex } from '@/lib/utils/hash';
import type { StoredResponse } from '@/types/contracts';

export async function runIdempotent(
  input: { scope: string; key: string; request: string },
  fn: () => Promise<StoredResponse>,
): Promise<{ replayed: boolean; response: StoredResponse }> {
  const service = getService('idempotency');
  const begin = await service.begin({
    scope: input.scope,
    key: input.key,
    requestHash: await sha256Hex(input.request),
  });
  if (begin.state === 'replay') return { replayed: true, response: begin.response };
  if (begin.state === 'conflict') throw new IdempotencyConflictError();
  if (begin.state === 'in_progress') throw new ConflictError('The same request is still running.');
  try {
    const response = await fn();
    await service.complete(input.scope, input.key, response);
    return { replayed: false, response };
  } catch (error) {
    await service.release(input.scope, input.key);
    throw error;
  }
}
