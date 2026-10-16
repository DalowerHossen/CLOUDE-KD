// path: services/client/privacy.ts
// Privacy requests for a client: anonymize (personal data replaced, numbers kept) or delete (anonymize and remove from
// the lists). The owner decides directly after a fresh step-up; a staff member's request waits for the owner in the
// approval list (rule client.anonymize, level L1) and a job applies the decision.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { clientAnonymizeHandlers, clientDeleteGuards } from '@/lib/crm/hooks';
import type { PrivacyRequestInput } from '@/lib/crm/privacy';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getClient } from './clients';

export interface PrivacyRequestView {
  id: string;
  clientId: string;
  kind: 'anonymize' | 'delete';
  reason: string;
  status: 'awaiting_approval' | 'completed' | 'rejected' | 'failed';
  result: string;
  createdAt: string;
}

const COLUMNS = 'id, client_id, kind, reason, status, result, created_at';
const view = (r: Record<string, unknown>): PrivacyRequestView => ({
  id: String(r.id),
  clientId: String(r.client_id),
  kind: String(r.kind) as PrivacyRequestView['kind'],
  reason: String(r.reason),
  status: String(r.status) as PrivacyRequestView['status'],
  result: String(r.result ?? ''),
  createdAt: String(r.created_at),
});

export async function listPrivacyRequests(
  companyId: string,
  clientId: string,
): Promise<PrivacyRequestView[]> {
  const { data, error } = await getAdminSupabase()
    .from('client_privacy_requests')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

async function execute(
  companyId: string,
  clientId: string,
  kind: 'anonymize' | 'delete',
  by: string,
): Promise<void> {
  for (const handler of clientAnonymizeHandlers()) await handler(companyId, clientId);
  const r = await getAdminSupabase().rpc('kd_client_anonymize', {
    p_company: companyId,
    p_client: clientId,
    p_delete: kind === 'delete',
    p_by: by,
  });
  if (r.error) {
    if (r.error.code === '22023') throw new ValidationError('This client was already anonymized.');
    throw new InternalError(r.error);
  }
  await getService('events').publish({
    name: 'client.updated',
    companyId,
    payload: { clientId, anonymized: true },
  });
}

export async function requestPrivacy(
  actor: Actor,
  input: PrivacyRequestInput,
): Promise<PrivacyRequestView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const client = await getClient(companyId, input.clientId);
  if (client.anonymized) throw new ValidationError('This client was already anonymized.');
  if (input.kind === 'delete')
    for (const guard of clientDeleteGuards()) {
      const reason = await guard(companyId, input.clientId);
      if (reason) throw new ValidationError(`${reason} Use "anonymize" instead.`);
    }
  const direct = actor.role === 'owner';
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('client_privacy_requests')
    .insert({
      company_id: companyId,
      client_id: input.clientId,
      kind: input.kind,
      reason: input.reason,
      requested_by: actor.userId,
      status: direct ? 'completed' : 'awaiting_approval',
      decided_at: direct ? new Date().toISOString() : null,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('A request for this client is already waiting.');
    throw new InternalError(error);
  }
  const id = String(data.id);
  if (direct) {
    try {
      await execute(companyId, input.clientId, input.kind, actor.userId);
    } catch (failure) {
      await admin
        .from('client_privacy_requests')
        .update({ status: 'failed', result: 'The request could not be completed.' })
        .eq('id', id);
      throw failure;
    }
  } else {
    const state = await getService('approval').request({
      action: 'client.anonymize',
      payload: { requestId: id },
      requesterId: actor.userId,
      companyId,
    });
    await admin
      .from('client_privacy_requests')
      .update({ approval_request_id: state.requestId })
      .eq('id', id);
  }
  await getService('audit').record({
    action: `client.privacy_${input.kind}_${direct ? 'done' : 'requested'}`,
    resourceType: 'client',
    resourceId: input.clientId,
    companyId,
    metadata: { request: id, by: actor.userId },
  });
  return view({ ...data, status: direct ? 'completed' : 'awaiting_approval' });
}

/** Job: applies the owner's decision on requests staff made. */
export async function syncPrivacyRequests(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('client_privacy_requests')
    .select('id, company_id, client_id, kind, requested_by, approval_request_id')
    .eq('status', 'awaiting_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(50);
  if (error) throw new InternalError(error);
  let applied = 0;
  for (const row of data ?? []) {
    const id = String(row.id);
    const state = await getService('approval')
      .status(String(row.approval_request_id))
      .catch(() => null);
    if (!state || state.status === 'pending' || state.status === 'escalated') continue;
    const now = new Date().toISOString();
    if (state.status !== 'approved') {
      await admin
        .from('client_privacy_requests')
        .update({
          status: 'rejected',
          decided_at: now,
          result: `The approval ended as ${state.status}.`,
        })
        .eq('id', id)
        .eq('status', 'awaiting_approval');
      continue;
    }
    // Claim the row first so two runs never apply it twice.
    const claim = await admin
      .from('client_privacy_requests')
      .update({ status: 'completed', decided_at: now })
      .eq('id', id)
      .eq('status', 'awaiting_approval')
      .select('id');
    if (claim.error || !claim.data || claim.data.length === 0) continue;
    try {
      await execute(
        String(row.company_id),
        String(row.client_id),
        String(row.kind) as 'anonymize' | 'delete',
        String(row.requested_by),
      );
      applied += 1;
    } catch {
      await admin
        .from('client_privacy_requests')
        .update({ status: 'failed', result: 'The request could not be completed.' })
        .eq('id', id);
    }
  }
  return applied;
}
