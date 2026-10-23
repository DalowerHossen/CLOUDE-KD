// path: services/dispute/disputes.ts
// Dispute cases: read, list, move through the status workflow, add notes, set the reason and the date the answer is
// due, and the numbers (stake, win rate, reasons). A case is made from the processor's event (intake.ts); a person
// never creates one by hand.
import 'server-only';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { categorize, EVIDENCE_HINTS, type ReasonCategory } from './reasons';
import { canMove, choices, isClosed, type DisputeStatus } from './status';

type Row = Record<string, unknown>;

export interface DisputeView {
  id: string;
  companyId: string;
  paymentId: string;
  invoiceId: string;
  clientId: string | null;
  processorId: string;
  processorDisputeId: string | null;
  status: DisputeStatus;
  reasonCode: string | null;
  reasonCategory: ReasonCategory;
  hint: string;
  amount: string;
  openedAt: string;
  dueAt: string;
  dueEstimated: boolean;
  submittedAt: string | null;
  closedAt: string | null;
  outcomeNote: string;
  version: number;
  /** The answer is past due and the case is still open. */
  overdue: boolean;
  /** Statuses a person can move this case to. */
  next: readonly DisputeStatus[];
}

export const DISPUTE_COLUMNS =
  'id, company_id, payment_id, invoice_id, client_id, processor_id, processor_dispute_id, status, reason_code, reason_category, amount, opened_at, due_at, due_estimated, submitted_at, closed_at, outcome_note, version';

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function toDispute(r: Row): DisputeView {
  const status = String(r.status) as DisputeStatus;
  const category = String(r.reason_category) as ReasonCategory;
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    paymentId: String(r.payment_id),
    invoiceId: String(r.invoice_id),
    clientId: str(r.client_id),
    processorId: String(r.processor_id),
    processorDisputeId: str(r.processor_dispute_id),
    status,
    reasonCode: str(r.reason_code),
    reasonCategory: category,
    hint: EVIDENCE_HINTS[category],
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    openedAt: String(r.opened_at),
    dueAt: String(r.due_at),
    dueEstimated: r.due_estimated === true,
    submittedAt: str(r.submitted_at),
    closedAt: str(r.closed_at),
    outcomeNote: String(r.outcome_note ?? ''),
    version: Number(r.version),
    overdue: !isClosed(status) && Date.parse(String(r.due_at)) < Date.now(),
    next: choices(status),
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new NotFoundError();
  return actor.companyId;
}

export async function addDisputeEvent(
  companyId: string,
  disputeId: string,
  kind: 'opened' | 'status' | 'evidence' | 'alert' | 'outcome',
  detail = '',
  actorId: string | null = null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('dispute_events')
    .insert({
      company_id: companyId,
      dispute_id: disputeId,
      kind,
      detail: detail.slice(0, 500),
      actor_id: actorId,
    });
  if (error) throw new InternalError(error);
}

export async function getDispute(companyId: string, id: string): Promise<DisputeView> {
  const { data, error } = await getAdminSupabase()
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toDispute(data);
}

export async function listDisputes(
  companyId: string | null,
  query: { status?: DisputeStatus; limit?: number } = {},
): Promise<DisputeView[]> {
  let q = getAdminSupabase()
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .is('deleted_at', null)
    .order('due_at', { ascending: true })
    .limit(Math.min(query.limit ?? 100, 500));
  if (companyId) q = q.eq('company_id', companyId);
  if (query.status) q = q.eq('status', query.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map(toDispute);
}

/** Moves a case. Closing statuses (won, lost, accepted, withdrawn) set the closing time. */
export async function moveDispute(
  actor: Actor,
  id: string,
  to: DisputeStatus,
  note: string,
): Promise<DisputeView> {
  const companyId = need(actor);
  const current = await getDispute(companyId, id);
  if (!canMove(current.status, to))
    throw new ValidationError(`A case that is ${current.status} cannot become ${to}.`);
  return applyMove(companyId, current, to, note, actor.userId);
}

export async function applyMove(
  companyId: string,
  current: DisputeView,
  to: DisputeStatus,
  note: string,
  actorId: string | null,
): Promise<DisputeView> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, outcome_note: note.slice(0, 1000) };
  if (isClosed(to)) patch.closed_at = now;
  if (to === 'submitted') patch.submitted_at = now;
  const { data, error } = await getAdminSupabase()
    .from('disputes')
    .update(patch)
    .eq('id', current.id)
    .eq('company_id', companyId)
    .eq('status', current.status)
    .eq('version', current.version)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await addDisputeEvent(
    companyId,
    current.id,
    isClosed(to) ? 'outcome' : 'status',
    `${current.status} -> ${to}${note ? `: ${note}` : ''}`,
    actorId,
  );
  return getDispute(companyId, current.id);
}

/** The real reason code and answer date, as shown in the processor's own dashboard. */
export async function setDisputeDetails(
  actor: Actor,
  id: string,
  input: { reasonCode: string | null; dueAt: string | null },
): Promise<DisputeView> {
  const companyId = need(actor);
  const current = await getDispute(companyId, id);
  if (isClosed(current.status)) throw new ValidationError('This case is closed.');
  const patch: Record<string, unknown> = {};
  if (input.reasonCode !== null) {
    patch.reason_code = input.reasonCode;
    patch.reason_category = categorize(current.processorId, input.reasonCode);
  }
  if (input.dueAt !== null) {
    patch.due_at = input.dueAt;
    patch.due_estimated = false;
    // A new date starts the alerts again.
    patch.alerted_72h_at = null;
    patch.alerted_24h_at = null;
    patch.alerted_overdue_at = null;
  }
  if (Object.keys(patch).length === 0) return current;
  const { data, error } = await getAdminSupabase()
    .from('disputes')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await addDisputeEvent(companyId, id, 'status', 'Reason or answer date updated', actor.userId);
  return getDispute(companyId, id);
}

export interface EvidenceView {
  id: string;
  kind: string;
  title: string;
  content: string;
  fileId: string | null;
  createdAt: string;
}

export async function listEvidence(companyId: string, disputeId: string): Promise<EvidenceView[]> {
  await getDispute(companyId, disputeId);
  const { data, error } = await getAdminSupabase()
    .from('dispute_evidence')
    .select('id, kind, title, content, file_id, created_at')
    .eq('dispute_id', disputeId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    content: String(r.content),
    fileId: str(r.file_id),
    createdAt: String(r.created_at),
  }));
}

export async function addNote(
  actor: Actor,
  id: string,
  input: { title: string; content: string },
): Promise<EvidenceView[]> {
  const companyId = need(actor);
  const current = await getDispute(companyId, id);
  if (isClosed(current.status)) throw new ValidationError('This case is closed.');
  const { error } = await getAdminSupabase().from('dispute_evidence').insert({
    company_id: companyId,
    dispute_id: id,
    kind: 'note',
    title: input.title,
    content: input.content,
    created_by: actor.userId,
  });
  if (error) throw new InternalError(error);
  await addDisputeEvent(companyId, id, 'evidence', `Note: ${input.title}`, actor.userId);
  return listEvidence(companyId, id);
}

export interface DisputeEventView {
  kind: string;
  detail: string;
  at: string;
}

export async function listDisputeEvents(
  companyId: string,
  id: string,
): Promise<DisputeEventView[]> {
  await getDispute(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('dispute_events')
    .select('kind, detail, created_at')
    .eq('dispute_id', id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    kind: String(r.kind),
    detail: String(r.detail),
    at: String(r.created_at),
  }));
}

export interface DisputeStats {
  open: number;
  submitted: number;
  won: number;
  lost: number;
  accepted: number;
  /** won / (won + lost) as a whole percent, or null when nothing was decided yet. */
  winRate: number | null;
  atStake: string;
  lostAmount: string;
  wonAmount: string;
  byReason: { category: ReasonCategory; count: number }[];
}

/** Win and loss numbers for one company, or for the whole platform when `companyId` is null. */
export async function disputeStats(companyId: string | null): Promise<DisputeStats> {
  let q = getAdminSupabase()
    .from('disputes')
    .select('status, amount, reason_category')
    .is('deleted_at', null)
    .limit(5000);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const sum = (pred: (r: Row) => boolean): string =>
    rows
      .filter(pred)
      .reduce((acc, r) => acc.add(Money.parseRounded(String(r.amount))), Money.zero())
      .toDbString();
  const count = (status: string): number => rows.filter((r) => r.status === status).length;
  const won = count('won');
  const lost = count('lost');
  const reasons = new Map<string, number>();
  for (const r of rows)
    reasons.set(String(r.reason_category), (reasons.get(String(r.reason_category)) ?? 0) + 1);
  return {
    open: count('new') + count('gathering'),
    submitted: count('submitted'),
    won,
    lost,
    accepted: count('accepted'),
    winRate: won + lost === 0 ? null : Math.round((won / (won + lost)) * 100),
    atStake: sum((r) => ['new', 'gathering', 'submitted'].includes(String(r.status))),
    lostAmount: sum((r) => r.status === 'lost' || r.status === 'accepted'),
    wonAmount: sum((r) => r.status === 'won'),
    byReason: [...reasons.entries()]
      .map(([category, n]) => ({ category: category as ReasonCategory, count: n }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function companyNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('id, name')
    .in('id', unique);
  if (error) throw new InternalError(error);
  return new Map((data ?? []).map((c) => [String(c.id), String(c.name)]));
}
