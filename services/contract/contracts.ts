// path: services/contract/contracts.ts
// Contracts: draft, edit (every save is kept as a version), list and read. A sent contract is frozen; the send, the
// reminders and the cancel are in send.ts.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import type { ContractInput } from './schemas';
import { contractNumber, isEditable, type ContractStatus } from './status';
import { cleanContractHtml, templateBody } from './templates';

type Row = Record<string, unknown>;

export interface SignerView {
  id: string;
  position: number;
  name: string;
  email: string;
  roleLabel: string;
  status: 'pending' | 'viewed' | 'signed' | 'declined';
  invitedAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
}

export interface ContractView {
  id: string;
  number: string;
  title: string;
  status: ContractStatus;
  clientId: string | null;
  clientName: string;
  templateKey: string | null;
  bodyHtml: string;
  terms: string;
  amount: string | null;
  effectiveOn: string | null;
  endsOn: string | null;
  signBy: string | null;
  renewalNoticeDays: number;
  signingOrder: 'parallel' | 'sequential';
  bodyHash: string | null;
  sentAt: string | null;
  signedAt: string | null;
  closedReason: string;
  version: number;
  createdAt: string;
  signers: SignerView[];
  /** A staff member asked the owner to send this draft and the answer is still open. */
  sendRequested: boolean;
  /** Why the owner said no to the last request (empty when there was none). */
  sendRejectedReason: string;
}

export const CONTRACT_COLUMNS =
  'id, number, title, status, client_id, template_key, body_html, merge_data, amount, effective_on, ends_on, sign_by, renewal_notice_days, signing_order, body_hash, sent_at, signed_at, closed_reason, version, created_at, send_request_id, send_rejected_reason';
export const SIGNER_COLUMNS =
  'id, position, name, email, role_label, status, invited_at, viewed_at, signed_at, reminder_count, last_reminded_at';

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function toSigner(r: Row): SignerView {
  return {
    id: String(r.id),
    position: Number(r.position),
    name: String(r.name),
    email: String(r.email),
    roleLabel: String(r.role_label ?? ''),
    status: String(r.status) as SignerView['status'],
    invitedAt: str(r.invited_at),
    viewedAt: str(r.viewed_at),
    signedAt: str(r.signed_at),
    reminderCount: Number(r.reminder_count ?? 0),
    lastRemindedAt: str(r.last_reminded_at),
  };
}

export function toContract(r: Row, signers: Row[], clientName: string): ContractView {
  const merge = (r.merge_data ?? {}) as { terms?: unknown };
  return {
    id: String(r.id),
    number: contractNumber(Number(r.number)),
    title: String(r.title),
    status: String(r.status) as ContractStatus,
    clientId: str(r.client_id),
    clientName,
    templateKey: str(r.template_key),
    bodyHtml: String(r.body_html),
    terms: typeof merge.terms === 'string' ? merge.terms : '',
    amount:
      r.amount === null || r.amount === undefined
        ? null
        : Money.parseRounded(String(r.amount)).toDbString(),
    effectiveOn: str(r.effective_on),
    endsOn: str(r.ends_on),
    signBy: str(r.sign_by),
    renewalNoticeDays: Number(r.renewal_notice_days),
    signingOrder: String(r.signing_order) as ContractView['signingOrder'],
    bodyHash: str(r.body_hash),
    sentAt: str(r.sent_at),
    signedAt: str(r.signed_at),
    closedReason: String(r.closed_reason ?? ''),
    version: Number(r.version),
    createdAt: String(r.created_at),
    signers: signers.map(toSigner),
    sendRequested: r.send_request_id !== null && r.send_request_id !== undefined,
    sendRejectedReason: String(r.send_rejected_reason ?? ''),
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new NotFoundError();
  return actor.companyId;
}

async function clientNames(companyId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, name')
    .eq('company_id', companyId)
    .in('id', unique);
  if (error) throw new InternalError(error);
  return new Map((data ?? []).map((c) => [String(c.id), String(c.name)]));
}

export async function getContract(companyId: string, id: string): Promise<ContractView> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const signers = await admin
    .from('contract_signers')
    .select(SIGNER_COLUMNS)
    .eq('contract_id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('position');
  if (signers.error) throw new InternalError(signers.error);
  const names = await clientNames(companyId, data.client_id ? [String(data.client_id)] : []);
  return toContract(data, signers.data ?? [], names.get(String(data.client_id)) ?? '');
}

export interface ContractListItem {
  id: string;
  number: string;
  title: string;
  status: ContractStatus;
  clientName: string;
  amount: string | null;
  endsOn: string | null;
  signersSigned: number;
  signersTotal: number;
  createdAt: string;
}

export async function listContracts(
  companyId: string,
  query: { status?: string; clientId?: string; limit?: number } = {},
): Promise<ContractListItem[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('contracts')
    .select('id, number, title, status, client_id, amount, ends_on, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(query.limit ?? 50, 200));
  if (query.status) q = q.eq('status', query.status);
  if (query.clientId) q = q.eq('client_id', query.clientId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const [names, signers] = await Promise.all([
    clientNames(
      companyId,
      rows.filter((r) => r.client_id).map((r) => String(r.client_id)),
    ),
    admin
      .from('contract_signers')
      .select('contract_id, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in(
        'contract_id',
        rows.map((r) => String(r.id)),
      ),
  ]);
  if (signers.error) throw new InternalError(signers.error);
  return rows.map((r) => {
    const mine = (signers.data ?? []).filter((s) => String(s.contract_id) === String(r.id));
    return {
      id: String(r.id),
      number: contractNumber(Number(r.number)),
      title: String(r.title),
      status: String(r.status) as ContractStatus,
      clientName: names.get(String(r.client_id)) ?? '',
      amount: r.amount === null ? null : Money.parseRounded(String(r.amount)).toDbString(),
      endsOn: str(r.ends_on),
      signersSigned: mine.filter((s) => s.status === 'signed').length,
      signersTotal: mine.length,
      createdAt: String(r.created_at),
    };
  });
}

/** Creates a draft (id null) or saves an existing draft; every save is kept as a version. */
export async function saveContract(
  actor: Actor,
  id: string | null,
  expectedVersion: number,
  input: ContractInput,
): Promise<ContractView> {
  const companyId = need(actor);
  if (id) {
    const current = await getContract(companyId, id);
    if (current.sendRequested)
      throw new ValidationError('Take back the request to send before you change the contract.');
  }
  if (input.clientId) {
    const client = await getService('clients').getById(input.clientId);
    if (client.companyId !== companyId) throw new NotFoundError();
  }
  if (input.templateKey) await templateBody(companyId, input.templateKey);
  const body = cleanContractHtml(input.bodyHtml);
  if (body.trim() === '') throw new ValidationError('The contract has no wording.');
  const { data, error } = await getAdminSupabase().rpc('kd_contract_save', {
    p_company: companyId,
    p_actor: actor.userId,
    p_id: id,
    p_expected: expectedVersion,
    p_fields: {
      client_id: input.clientId ?? '',
      template_key: input.templateKey ?? '',
      title: input.title,
      body_html: body,
      merge_data: { terms: input.terms },
      signing_order: input.signingOrder,
      amount: input.amount ?? '',
      effective_on: input.effectiveOn ?? '',
      ends_on: input.endsOn ?? '',
      sign_by: input.signBy ?? '',
      renewal_notice_days: input.renewalNoticeDays,
    },
    p_signers: input.signers.map((s, i) => ({
      position: i + 1,
      name: s.name,
      email: s.email,
      role_label: s.roleLabel,
    })),
  });
  if (error) {
    if (error.code === 'P0002') throw new NotFoundError();
    if (error.code === '22023') throw new ValidationError('A sent contract cannot be edited.');
    if (error.code === '40001')
      throw new ConflictError('The contract was changed by someone else. Reload and try again.');
    if (error.code === '23505')
      throw new ValidationError('Each signer needs a different e-mail address.');
    throw new InternalError(error);
  }
  return getContract(companyId, String(data));
}

export async function trashDraft(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const current = await getContract(companyId, id);
  if (!isEditable(current.status)) throw new ValidationError('Only a draft can be deleted.');
  const { error } = await getAdminSupabase()
    .from('contracts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft');
  if (error) throw new InternalError(error);
}

export interface VersionView {
  versionNo: number;
  title: string;
  at: string;
  bodyHtml: string;
}

export async function listVersions(companyId: string, id: string): Promise<VersionView[]> {
  await getContract(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('contract_versions')
    .select('version_no, title, body_html, created_at')
    .eq('contract_id', id)
    .eq('company_id', companyId)
    .order('version_no', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    versionNo: Number(r.version_no),
    title: String(r.title),
    at: String(r.created_at),
    bodyHtml: String(r.body_html),
  }));
}

export interface EventView {
  kind: string;
  detail: string;
  at: string;
  signerId: string | null;
}

export async function listEvents(companyId: string, id: string): Promise<EventView[]> {
  await getContract(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('contract_events')
    .select('kind, detail, created_at, signer_id')
    .eq('contract_id', id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    kind: String(r.kind),
    detail: String(r.detail),
    at: String(r.created_at),
    signerId: str(r.signer_id),
  }));
}

export async function listClientOptions(
  companyId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((c) => ({ id: String(c.id), name: String(c.name) }));
}
