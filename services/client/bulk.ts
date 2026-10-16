// path: services/client/bulk.ts
// Bulk actions on clients: archive, reactivate, delete, tags, risk flag, payment terms. Each client is handled on its
// own, so one refusal (for example a delete guard) never blocks the rest. The answer lists how many were done and why
// the others were not.
import 'server-only';
import { getService } from '@/lib/container';
import { AppError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { BulkInput } from '@/lib/crm/privacy';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { deleteClient, setClientStatus } from './clients';

export interface BulkResult {
  done: number;
  failed: { id: string; reason: string }[];
}

async function setColumns(
  companyId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const r = await getAdminSupabase()
    .from('clients')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .is('anonymized_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
}

async function changeTag(companyId: string, id: string, tag: string, add: boolean): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('tags')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const current = (data.tags as string[] | null) ?? [];
  const next = add ? [...new Set([...current, tag])] : current.filter((x) => x !== tag);
  if (next.length > 20) throw new ValidationError('A client can have 20 tags at most.');
  await setColumns(companyId, id, { tags: next });
}

export async function bulkClients(actor: Actor, input: BulkInput): Promise<BulkResult> {
  const companyId = actor.companyId as string;
  const result: BulkResult = { done: 0, failed: [] };
  for (const id of input.ids) {
    try {
      switch (input.action) {
        case 'archive':
          await setClientStatus(actor, id, 'archive');
          break;
        case 'reactivate':
          await setClientStatus(actor, id, 'reactivate');
          break;
        case 'delete':
          await deleteClient(actor, id);
          break;
        case 'add_tag':
          await changeTag(companyId, id, input.value, true);
          break;
        case 'remove_tag':
          await changeTag(companyId, id, input.value, false);
          break;
        case 'set_risk':
          await setColumns(companyId, id, { risk_flag: input.value });
          break;
        case 'set_terms':
          await setColumns(companyId, id, { payment_terms_days: input.value });
          break;
      }
      result.done += 1;
    } catch (error) {
      result.failed.push({
        id,
        reason: error instanceof AppError && error.expose ? error.message : 'The change failed.',
      });
    }
  }
  await getService('audit').record({
    action: 'client.bulk',
    resourceType: 'client',
    resourceId: null,
    companyId,
    metadata: {
      action: input.action,
      requested: input.ids.length,
      done: result.done,
      by: actor.userId,
    },
  });
  return result;
}
