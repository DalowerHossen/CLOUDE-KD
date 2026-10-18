// path: services/contract/send-gate.ts
// Owner-only sending of contracts. The owner sends at once (send.ts). A staff member writes the draft and asks: the ask
// goes through the approval service (rule "contract.send"), the draft is locked against edits while it waits, and a job
// sends it when the owner approves, but only if the draft is exactly the one that was shown to the owner.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getContract, type ContractView } from './contracts';
import { addEvent, sendContract } from './send';

const log = createLogger({ component: 'contract-send-gate' });

export async function requestContractSend(
  actor: Actor,
  id: string,
  message: string,
): Promise<ContractView> {
  if (!actor.companyId) throw new NotFoundError();
  const companyId = actor.companyId;
  const draft = await getContract(companyId, id);
  if (draft.status !== 'draft') throw new ValidationError('This contract was already sent.');
  if (draft.sendRequested)
    throw new ValidationError('A request to send this contract is already waiting.');
  const state = await getService('approval').request({
    action: 'contract.send',
    payload: { contractId: id, message },
    requesterId: actor.userId,
    companyId,
  });
  const { data, error } = await getAdminSupabase()
    .from('contracts')
    .update({
      send_request_id: state.requestId,
      send_requested_by: actor.userId,
      send_request_version: draft.version,
      send_message: message,
      send_rejected_reason: '',
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .eq('version', draft.version)
    .is('send_request_id', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await addEvent(companyId, id, 'send_requested', message.slice(0, 200), null, actor.userId);
  await getService('notification')
    .notify({
      companyId,
      type: 'contract.send_requested',
      title: 'A contract waits for your approval',
      body: `${draft.number} ${draft.title} is ready to send.`,
      href: `/contracts/${id}`,
    })
    .catch(() => undefined);
  return getContract(companyId, id);
}

/** Staff: take the request back (the draft can then be edited again). */
export async function withdrawContractRequest(actor: Actor, id: string): Promise<ContractView> {
  if (!actor.companyId) throw new NotFoundError();
  const current = await getContract(actor.companyId, id);
  if (!current.sendRequested) throw new ValidationError('Nothing is waiting for approval.');
  const { error } = await getAdminSupabase()
    .from('contracts')
    .update({ send_request_id: null, send_requested_by: null, send_request_version: null })
    .eq('id', id)
    .eq('company_id', actor.companyId)
    .eq('status', 'draft');
  if (error) throw new InternalError(error);
  return getContract(actor.companyId, id);
}

function actorFor(companyId: string, userId: string): Actor {
  return {
    userId,
    role: 'staff',
    subRole: null,
    companyId,
    email: 'approval@invalid.local',
    sessionId: 'approval',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: false,
  };
}

/** Job (every few minutes): sends what the owner approved, and returns the rest to staff with the reason. */
export async function syncContractApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('contracts')
    .select(
      'id, company_id, send_request_id, send_requested_by, send_request_version, send_message, version',
    )
    .eq('status', 'draft')
    .not('send_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(50);
  if (error) throw new InternalError(error);
  let changed = 0;
  for (const row of data ?? []) {
    const id = String(row.id);
    const companyId = String(row.company_id);
    const state = await getService('approval')
      .status(String(row.send_request_id))
      .catch(() => null);
    if (!state || state.status === 'pending' || state.status === 'escalated') continue;
    let reason = '';
    if (state.status === 'approved') {
      if (Number(row.version) !== Number(row.send_request_version)) {
        reason = 'The contract was changed after the owner was asked. Ask again.';
      } else {
        try {
          const by = String(row.send_requested_by ?? '');
          await admin
            .from('contracts')
            .update({ send_request_id: null })
            .eq('id', id)
            .eq('company_id', companyId);
          await sendContract(actorFor(companyId, by), id, String(row.send_message ?? ''));
          changed += 1;
          continue;
        } catch {
          log.error('approved contract could not be sent', { contract: id });
          reason = 'The contract could not be sent after approval. Check it and ask again.';
        }
      }
    } else {
      reason = `The approval ended as ${state.status}.`;
    }
    await admin
      .from('contracts')
      .update({
        send_request_id: null,
        send_requested_by: null,
        send_request_version: null,
        send_rejected_reason: reason,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft');
    await addEvent(companyId, id, 'send_rejected', reason);
    changed += 1;
  }
  return changed;
}
