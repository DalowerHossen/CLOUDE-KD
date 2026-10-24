// path: services/approval/bulk.ts
// Bulk approve or reject. Every item is decided on its own; one failure never stops the others.
import 'server-only';
import { AppError } from '@/lib/errors';
import type { Actor } from '@/types/contracts';
import { decideAs } from './approval-service';

export interface BulkItemResult {
  requestId: string;
  ok: boolean;
  status: string | null;
  error: string | null;
}

export async function bulkDecide(
  actor: Actor,
  requestIds: readonly string[],
  decision: 'approve' | 'reject',
  reason: string | null,
): Promise<BulkItemResult[]> {
  const results: BulkItemResult[] = [];
  for (const requestId of requestIds) {
    try {
      const state = await decideAs(
        actor,
        requestId,
        { approverId: actor.userId, decision, reason },
        actor.companyId,
      );
      results.push({ requestId, ok: true, status: state.status, error: null });
    } catch (error) {
      results.push({
        requestId,
        ok: false,
        status: null,
        error: error instanceof AppError ? error.message : 'The request could not be decided.',
      });
    }
  }
  return results;
}
