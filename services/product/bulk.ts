// path: services/product/bulk.ts
// Bulk actions on products: archive, activate, deactivate, delete. Each item is handled on its own, so one refusal
// (for example "the item is in a bundle") never blocks the rest; the answer lists why the others were not done.
import 'server-only';
import { getService } from '@/lib/container';
import { AppError } from '@/lib/errors';
import type { ProductBulk } from '@/lib/transfer/bulk';
import type { Actor } from '@/types/contracts';
import type { BulkResult } from '@/services/client/bulk';
import { deleteProduct, setProductStatus } from './products';

export async function bulkProducts(actor: Actor, input: ProductBulk): Promise<BulkResult> {
  const result: BulkResult = { done: 0, failed: [] };
  for (const id of input.ids) {
    try {
      if (input.action === 'delete') await deleteProduct(actor, id);
      else
        await setProductStatus(
          actor,
          id,
          input.action === 'archive'
            ? 'archived'
            : input.action === 'activate'
              ? 'active'
              : 'inactive',
        );
      result.done += 1;
    } catch (error) {
      result.failed.push({
        id,
        reason: error instanceof AppError && error.expose ? error.message : 'The change failed.',
      });
    }
  }
  await getService('audit').record({
    action: 'product.bulk',
    resourceType: 'product',
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
