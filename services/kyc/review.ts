// path: services/kyc/review.ts
// KYC review (platform side). A reviewer (admin staff with the kyc_reviewer role, the CEO or the super admin) opens
// the queue, looks at documents (every look is logged first), checks them, and recommends approval; the final approval
// is a separate step by the CEO through the approval engine (maker-checker). The reviewer can also ask for changes or
// reject. Applying the CEO's decision is done by syncKycApprovals (the approval contract has no callback).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  EXPIRY_WARNING_DAYS,
  VERIFICATION_YEARS,
  ownersSchema,
  type DocType,
  type Owners,
  type SubmissionStatus,
} from '@/lib/kyc/rules';
import type { ReviewAction } from '@/lib/kyc/review-input';
import { runScreening, type ScreeningSubject } from '@/lib/kyc/screening';
import { ensureSanctionsProvider } from '@/services/compliance/sanctions';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'kyc-review' });
const DAY = 86_400_000;

export interface QueueItem {
  id: string;
  companyId: string;
  companyName: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  risk: string | null;
  duplicate: boolean;
  awaitingApproval: boolean;
  round: number;
}

export async function reviewQueue(): Promise<QueueItem[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('kyc_submissions')
    .select(
      'id, company_id, status, submitted_at, risk_level, duplicate_flag, approval_request_id, round',
    )
    .in('status', ['submitted', 'in_review'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  const ids = [...new Set((data ?? []).map((r) => String(r.company_id)))];
  const names = ids.length
    ? await admin.from('companies').select('id, name').in('id', ids)
    : { data: [], error: null };
  if (names.error) throw new InternalError(names.error);
  const name = new Map((names.data ?? []).map((c) => [String(c.id), String(c.name)]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    companyId: String(r.company_id),
    companyName: name.get(String(r.company_id)) ?? '',
    status: String(r.status) as SubmissionStatus,
    submittedAt: r.submitted_at ? String(r.submitted_at) : null,
    risk: r.risk_level ? String(r.risk_level) : null,
    duplicate: r.duplicate_flag === true,
    awaitingApproval: r.approval_request_id !== null,
    round: Number(r.round),
  }));
}

export interface ReviewDetail extends QueueItem {
  reviewNote: string;
  decisionReason: string;
  screeningStatus: string;
  screeningSummary: string;
  recommendedBy: string | null;
  owners: Owners['owners'];
  documents: {
    id: string;
    docType: DocType;
    name: string;
    mimeType: string;
    status: string;
    rejectReason: string;
    expiresOn: string | null;
    duplicate: boolean;
  }[];
  version: number;
}

async function load(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data;
}

export async function reviewDetail(id: string): Promise<ReviewDetail> {
  const row = await load(id);
  const companyId = String(row.company_id);
  const admin = getAdminSupabase();
  const [company, docs] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    admin
      .from('kyc_documents')
      .select(
        'id, doc_type, file_name, mime_type, status, reject_reason, document_expires_on, duplicate_of_company',
      )
      .eq('submission_id', id)
      .is('deleted_at', null),
  ]);
  if (docs.error) throw new InternalError(docs.error);
  let owners: Owners['owners'] = [];
  if (row.owners_encrypted) {
    const bytes = await getService('encryption').decrypt(
      'kyc',
      row.owners_encrypted as never,
      companyId,
    );
    const parsed = ownersSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    owners = parsed.success ? parsed.data.owners : [];
  }
  return {
    id,
    companyId,
    companyName: String(company.data?.name ?? ''),
    status: String(row.status) as SubmissionStatus,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    risk: row.risk_level ? String(row.risk_level) : null,
    duplicate: row.duplicate_flag === true,
    awaitingApproval: row.approval_request_id !== null,
    round: Number(row.round),
    reviewNote: String(row.review_note),
    decisionReason: String(row.decision_reason),
    screeningStatus: String(row.screening_status),
    screeningSummary: String(row.screening_summary),
    recommendedBy: row.recommended_by ? String(row.recommended_by) : null,
    owners,
    documents: (docs.data ?? []).map((d) => ({
      id: String(d.id),
      docType: String(d.doc_type) as DocType,
      name: String(d.file_name),
      mimeType: String(d.mime_type),
      status: String(d.status),
      rejectReason: String(d.reject_reason),
      expiresOn: d.document_expires_on ? String(d.document_expires_on) : null,
      duplicate: d.duplicate_of_company !== null,
    })),
    version: Number(row.version),
  };
}

async function audit(
  actor: Actor,
  action: string,
  id: string,
  companyId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'kyc_submission',
    resourceId: id,
    companyId,
    metadata: { ...metadata, by: actor.userId },
  });
}

async function setStatus(
  id: string,
  from: SubmissionStatus[],
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .update(patch)
    .eq('id', id)
    .in('status', from)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
}

async function screen(detail: ReviewDetail): Promise<{ status: string; summary: string }> {
  const subjects: ScreeningSubject[] = [
    { name: detail.companyName, countryCode: null, kind: 'business' },
    ...detail.owners.map((o) => ({
      name: o.fullName,
      countryCode: o.nationality,
      kind: 'person' as const,
    })),
  ];
  ensureSanctionsProvider();
  const result = await runScreening(subjects);
  return (
    result ?? {
      status: 'not_configured',
      summary:
        'No screening provider is connected. Check names against the sanctions lists by hand.',
    }
  );
}

export async function runReviewAction(
  actor: Actor,
  id: string,
  input: ReviewAction,
): Promise<unknown> {
  const detail = await reviewDetail(id);
  const admin = getAdminSupabase();
  switch (input.action) {
    case 'start': {
      if (detail.status !== 'submitted')
        throw new ValidationError('Only a submitted verification can be started.');
      const result = await screen(detail);
      await setStatus(id, ['submitted'], {
        status: 'in_review',
        reviewer_id: actor.userId,
        review_started_at: new Date().toISOString(),
        screening_status: result.status,
        screening_summary: result.summary,
        screened_at: new Date().toISOString(),
      });
      await audit(actor, 'kyc.review_started', id, detail.companyId, { screening: result.status });
      return { screening: result.status };
    }
    case 'documents': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      for (const doc of input.documents) {
        if (doc.status === 'rejected' && doc.reason.length < 3)
          throw new ValidationError('Give a reason for every rejected document.');
        const r = await admin
          .from('kyc_documents')
          .update({
            status: doc.status,
            reject_reason: doc.status === 'rejected' ? doc.reason : '',
          })
          .eq('id', doc.id)
          .eq('submission_id', id)
          .is('deleted_at', null)
          .select('id');
        if (r.error) throw new InternalError(r.error);
        if (!r.data || r.data.length === 0) throw new NotFoundError();
      }
      await audit(actor, 'kyc.documents_checked', id, detail.companyId, {
        rejected: input.documents.filter((d) => d.status === 'rejected').length,
      });
      return { done: true };
    }
    case 'note': {
      if (detail.status !== 'in_review' && detail.status !== 'submitted')
        throw new ValidationError('This verification is closed.');
      const r = await admin
        .from('kyc_submissions')
        .update({ risk_level: input.risk, review_note: input.note })
        .eq('id', id);
      if (r.error) throw new InternalError(r.error);
      await audit(actor, 'kyc.note_saved', id, detail.companyId, { risk: input.risk });
      return { done: true };
    }
    case 'recommend': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      if (detail.awaitingApproval)
        throw new ValidationError('A recommendation is already waiting for the final approval.');
      if (detail.documents.length < 4 || detail.documents.some((d) => d.status !== 'accepted'))
        throw new ValidationError('Accept all four documents first.');
      if (detail.screeningStatus === 'hits')
        throw new ValidationError(
          'The screening found matches. Resolve them (reject or ask for changes) before you recommend approval.',
        );
      if (!detail.risk) throw new ValidationError('Set a risk level first.');
      const state = await getService('approval').request({
        action: 'kyc.approve',
        payload: {
          submissionId: id,
          companyId: detail.companyId,
          companyName: detail.companyName,
          risk: detail.risk,
          round: detail.round,
        },
        requesterId: actor.userId,
        companyId: null,
      });
      await setStatus(id, ['in_review'], {
        approval_request_id: state.requestId,
        recommended_by: actor.userId,
      });
      await audit(actor, 'kyc.recommended', id, detail.companyId, { request: state.requestId });
      return { requestId: state.requestId };
    }
    case 'request_changes':
    case 'reject': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      const changes = input.action === 'request_changes';
      if (changes && !detail.documents.some((d) => d.status === 'rejected'))
        throw new ValidationError(
          'Mark at least one document as rejected, with a reason, before you ask for changes.',
        );
      await setStatus(id, ['in_review'], {
        status: changes ? 'changes_requested' : 'rejected',
        decision_reason: input.reason,
        decided_at: new Date().toISOString(),
        approval_request_id: null,
      });
      await getService('events').publish({
        name: 'kyc.rejected',
        companyId: detail.companyId,
        payload: { submissionId: id, changesRequested: changes },
      });
      await audit(actor, changes ? 'kyc.changes_requested' : 'kyc.rejected', id, detail.companyId);
      return { done: true };
    }
  }
}

/** Opens one document for a reviewer. The view is logged first; if the log fails, nothing is read. */
export async function openDocument(
  actor: Actor,
  documentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('kyc_documents')
    .select('id, company_id, file_id, file_name, mime_type, submission_id')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const sub = await admin
    .from('kyc_submissions')
    .select('status')
    .eq('id', String(data.submission_id))
    .maybeSingle();
  if (sub.error) throw new InternalError(sub.error);
  if (
    !sub.data ||
    !['submitted', 'in_review', 'changes_requested', 'approved'].includes(String(sub.data.status))
  )
    throw new ForbiddenError();
  const logged = await admin.from('kyc_document_views').insert({
    company_id: String(data.company_id),
    document_id: String(data.id),
    viewer_id: actor.userId,
    viewer_role: actor.subRole ?? actor.role,
    purpose: sub.data.status === 'approved' ? 'recheck' : 'review',
  });
  if (logged.error) throw new InternalError(logged.error);
  await getService('audit').record({
    action: 'kyc.document_viewed',
    resourceType: 'kyc_document',
    resourceId: String(data.id),
    companyId: String(data.company_id),
    metadata: { by: actor.userId },
  });
  const file = await getService('storage').get(String(data.file_id));
  return { bytes: file.bytes, mimeType: String(data.mime_type), name: String(data.file_name) };
}

async function finalize(row: Record<string, unknown>): Promise<void> {
  const admin = getAdminSupabase();
  const now = Date.now();
  const expiresAt = new Date(now + VERIFICATION_YEARS * 365 * DAY).toISOString();
  const id = String(row.id);
  const companyId = String(row.company_id);
  await setStatus(id, ['in_review'], {
    status: 'approved',
    decided_at: new Date(now).toISOString(),
    expires_at: expiresAt,
    reverify_due_at: new Date(Date.parse(expiresAt) - EXPIRY_WARNING_DAYS * DAY).toISOString(),
    decision_reason: '',
  });
  // An earlier approval of the same company is replaced by this one.
  await admin
    .from('kyc_submissions')
    .update({ status: 'expired' })
    .eq('company_id', companyId)
    .eq('status', 'approved')
    .neq('id', id);
  await getService('events').publish({
    name: 'kyc.approved',
    companyId,
    payload: { submissionId: id },
  });
  await getService('audit').record({
    action: 'kyc.approved',
    resourceType: 'kyc_submission',
    resourceId: id,
    companyId,
    metadata: { expiresAt, request: String(row.approval_request_id) },
  });
}

/** Applies decisions of the approval engine to submissions waiting for the final approval. */
export async function syncKycApprovals(): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .select('id, company_id, approval_request_id, review_note')
    .eq('status', 'in_review')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(100);
  if (error) throw new InternalError(error);
  let changed = 0;
  for (const row of data ?? []) {
    const state = await getService('approval')
      .status(String(row.approval_request_id))
      .catch(() => null);
    if (!state) continue;
    if (state.status === 'approved') {
      await finalize(row);
      changed += 1;
    } else if (['rejected', 'expired', 'cancelled'].includes(state.status)) {
      // The CEO did not approve: the reviewer decides what happens next.
      await getAdminSupabase()
        .from('kyc_submissions')
        .update({
          approval_request_id: null,
          recommended_by: null,
          review_note: `${String(row.review_note)}\nFinal approval was ${state.status}.`
            .trim()
            .slice(0, 4000),
        })
        .eq('id', String(row.id));
      await getService('audit').record({
        action: 'kyc.approval_not_granted',
        resourceType: 'kyc_submission',
        resourceId: String(row.id),
        companyId: String(row.company_id),
        metadata: { status: state.status },
      });
      changed += 1;
    }
  }
  return changed;
}

/** Warns owners 30 days before the end and marks ended verifications as expired. */
export async function processKycExpiry(): Promise<{ warned: number; expired: number }> {
  const admin = getAdminSupabase();
  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY).toISOString();
  const warn = await admin
    .from('kyc_submissions')
    .select('id, company_id, expires_at')
    .eq('status', 'approved')
    .is('expiry_notified_at', null)
    .lte('expires_at', soon)
    .gt('expires_at', now.toISOString())
    .is('deleted_at', null)
    .limit(200);
  if (warn.error) throw new InternalError(warn.error);
  for (const r of warn.data ?? []) {
    await getService('notification').notify({
      companyId: String(r.company_id),
      type: 'kyc.expiring',
      title: 'Verify your business again',
      body: `Your business verification ends on ${String(r.expires_at).slice(0, 10)}. Submit your documents again to keep your limits.`,
      href: '/settings/kyc',
    });
    await admin
      .from('kyc_submissions')
      .update({ expiry_notified_at: now.toISOString() })
      .eq('id', String(r.id));
  }
  const ended = await admin
    .from('kyc_submissions')
    .update({ status: 'expired' })
    .eq('status', 'approved')
    .lte('expires_at', now.toISOString())
    .is('deleted_at', null)
    .select('id, company_id');
  if (ended.error) throw new InternalError(ended.error);
  for (const r of ended.data ?? []) {
    log.info('kyc verification ended', { submission: String(r.id) });
    await getService('audit').record({
      action: 'kyc.expired',
      resourceType: 'kyc_submission',
      resourceId: String(r.id),
      companyId: String(r.company_id),
    });
    await getService('notification').notify({
      companyId: String(r.company_id),
      type: 'kyc.expired',
      title: 'Business verification ended',
      body: 'Payouts and higher limits are paused until you verify again.',
      href: '/settings/kyc',
    });
  }
  return { warned: warn.data?.length ?? 0, expired: ended.data?.length ?? 0 };
}
