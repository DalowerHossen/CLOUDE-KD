// path: services/supplier/bulk.ts
// Bulk actions on suppliers: archive, reactivate, delete. Each supplier is handled on its own.
import 'server-only';
import { getService } from '@/lib/container';
import { AppError } from '@/lib/errors';
import type { SupplierBulk } from '@/lib/transfer/bulk';
import type { Actor } from '@/types/contracts';
import type { BulkResult } from '@/services/client/bulk';
import { deleteSupplier, setSupplierStatus } from './suppliers';

export async function bulkSuppliers(actor: Actor, input: SupplierBulk): Promise<BulkResult> {
  const result: BulkResult = { done: 0, failed: [] };
  for (const id of input.ids) {
    try {
      if (input.action === 'delete') await deleteSupplier(actor, id);
      else await setSupplierStatus(actor, id, input.action);
      result.done += 1;
    } catch (error) {
      result.failed.push({
        id,
        reason: error instanceof AppError && error.expose ? error.message : 'The change failed.',
      });
    }
  }
  await getService('audit').record({
    action: 'supplier.bulk',
    resourceType: 'supplier',
    resourceId: null,
    companyId: actor.companyId as string,
    metadata: {
      action: input.action,
      requested: input.ids.length,
      done: result.done,
      by: actor.userId,
    },
  });
  return result;
}
