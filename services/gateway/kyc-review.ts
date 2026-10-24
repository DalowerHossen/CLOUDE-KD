// path: services/gateway/kyc-review.ts
// KYC of the sub-merchants from the main merchant's side: the queue, the case, a look at a document (logged before the file is read),
// and the steps of the review: start (with the sanctions and country screening), check the documents, risk and note, approve, ask for
// changes, reject. A match of the screening cannot be approved. Everything is scoped to the reviewer's company.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { kycReviewAction, shownStatus, type KycReviewAction } from '@/lib/gateway/kyc-rules';
import { runScreening, type ScreeningSubject } from '@/lib/kyc/screening';
import {
  VERIFICATION_YEARS,
  ownersSchema,
  type DocType,
  type Owners,
  type SubmissionStatus,
} from '@/lib/kyc/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { ensureSanctionsProvider } from '@/services/compliance/sanctions';
import { need } from './db';

const DAY = 86_400_000;

export interface KycQueueItem {
  id: string;
  subMerchantId: string;
  subMerchantName: string;
  status: SubmissionStatus;
  round: number;
  submittedAt: string | null;
  risk: string | null;
  screeningStatus: string;
}

export interface KycCaseDocument {
  id: string;
  docType: DocType;
  name: string;
  mimeType: string;
  status: 'pending' | 'accepted' | 'rejected';
  rejectReason: string;
  expiresOn: string | null;
}

export interface KycCase extends KycQueueItem {
  businessName: string;
  businessCountry: string;
  reviewNote: string;
  decisionReason: string;
  screeningSummary: string;
  owners: Owners['owners'];
  documents: KycCaseDocument[];
  expiresAt: string | null;
  version: number;
}

const COLUMNS =
  'id, company_id, sub_merchant_id, round, status, business_name, business_country, owners_encrypted, risk_level, review_note, decision_reason, submitted_at, expires_at, screening_status, screening_summary, version';

type Row = Record<string, unknown>;

async function subName(companyId: string, id: string): Promise<string> {
  const { data } = await getAdminSupabase()
    .from('sub_merchants')
    .select('name')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  return data ? String(data.name) : '';
}

const toItem = (r: Row, name: string): KycQueueItem => ({
  id: String(r.id),
  subMerchantId: String(r.sub_merchant_id),
  subMerchantName: name,
  status: shownStatus(
    String(r.status) as SubmissionStatus,
    r.expires_at ? String(r.expires_at) : null,
    new Date(),
  ),
  round: Number(r.round),
  submittedAt: r.submitted_at ? String(r.submitted_at) : null,
  risk: r.risk_level ? String(r.risk_level) : null,
  screeningStatus: String(r.screening_status),
});

export async function kycQueue(companyId: string): Promise<KycQueueItem[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('sub_merchant_kyc')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new InternalError(error);
  const subs = await admin.from('sub_merchants').select('id, name').eq('company_id', companyId);
  if (subs.error) throw new InternalError(subs.error);
  const names = new Map((subs.data ?? []).map((s) => [String(s.id), String(s.name)]));
  return (data ?? []).map((r) => toItem(r, names.get(String(r.sub_merchant_id)) ?? ''));
}

async function loadRow(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data;
}

export async function kycCase(companyId: string, id: string): Promise<KycCase> {
  const row = await loadRow(companyId, id);
  const docs = await getAdminSupabase()
    .from('sub_merchant_kyc_documents')
    .select('id, doc_type, file_name, mime_type, status, reject_reason, document_expires_on')
    .eq('company_id', companyId)
    .eq('submission_id', id)
    .is('deleted_at', null);
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
    ...toItem(row, await subName(companyId, String(row.sub_merchant_id))),
    businessName: row.business_name ? String(row.business_name) : '',
    businessCountry: row.business_country ? String(row.business_country) : '',
    reviewNote: String(row.review_note),
    decisionReason: String(row.decision_reason),
    screeningSummary: String(row.screening_summary),
    owners,
    documents: (docs.data ?? []).map((d) => ({
      id: String(d.id),
      docType: String(d.doc_type) as DocType,
      name: String(d.file_name),
      mimeType: String(d.mime_type),
      status: String(d.status) as KycCaseDocument['status'],
      rejectReason: String(d.reject_reason),
      expiresOn: d.document_expires_on ? String(d.document_expires_on) : null,
    })),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    version: Number(row.version),
  };
}

async function audit(
  actor: Actor,
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'sub_merchant_kyc',
    resourceId: id,
    companyId,
    metadata: { ...metadata, by: actor.userId },
  });
}

async function setStatus(
  companyId: string,
  id: string,
  from: SubmissionStatus[],
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .in('status', from)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
}

async function screen(c: KycCase): Promise<{ status: string; summary: string }> {
  const subjects: ScreeningSubject[] = [
    { name: c.businessName, countryCode: c.businessCountry || null, kind: 'business' },
    ...c.owners.map((o) => ({
      name: o.fullName,
      countryCode: o.nationality,
      kind: 'person' as const,
    })),
  ];
  ensureSanctionsProvider();
  return (
    (await runScreening(subjects)) ?? {
      status: 'not_configured',
      summary:
        'No screening provider is connected. Check the names against the sanctions lists by hand.',
    }
  );
}

export async function runKycAction(
  actor: Actor,
  id: string,
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const companyId = need(actor);
  const parsed = kycReviewAction.safeParse(rawInput);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The action is not valid.');
  const input: KycReviewAction = parsed.data;
  const detail = await kycCase(companyId, id);
  const admin = getAdminSupabase();
  switch (input.action) {
    case 'start': {
      if (detail.status !== 'submitted')
        throw new ValidationError('Only a submitted verification can be started.');
      const result = await screen(detail);
      await setStatus(companyId, id, ['submitted'], {
        status: 'in_review',
        reviewer_id: actor.userId,
        review_started_at: new Date().toISOString(),
        screening_status: result.status,
        screening_summary: result.summary,
        screened_at: new Date().toISOString(),
      });
      await audit(actor, companyId, 'gateway.kyc_review_started', id, { screening: result.status });
      return { screening: result.status };
    }
    case 'documents': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      for (const doc of input.documents) {
        if (doc.status === 'rejected' && doc.reason.length < 3)
          throw new ValidationError('Give a reason for every rejected document.');
        const r = await admin
          .from('sub_merchant_kyc_documents')
          .update({
            status: doc.status,
            reject_reason: doc.status === 'rejected' ? doc.reason : '',
          })
          .eq('company_id', companyId)
          .eq('id', doc.id)
          .eq('submission_id', id)
          .is('deleted_at', null)
          .select('id');
        if (r.error) throw new InternalError(r.error);
        if (!r.data || r.data.length === 0) throw new NotFoundError();
      }
      await audit(actor, companyId, 'gateway.kyc_documents_checked', id, {
        rejected: input.documents.filter((d) => d.status === 'rejected').length,
      });
      return { done: true };
    }
    case 'note': {
      if (detail.status !== 'in_review' && detail.status !== 'submitted')
        throw new ValidationError('This verification is closed.');
      const r = await admin
        .from('sub_merchant_kyc')
        .update({ risk_level: input.risk, review_note: input.note })
        .eq('company_id', companyId)
        .eq('id', id);
      if (r.error) throw new InternalError(r.error);
      await audit(actor, companyId, 'gateway.kyc_note_saved', id, { risk: input.risk });
      return { done: true };
    }
    case 'approve': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      if (detail.documents.length < 4 || detail.documents.some((d) => d.status !== 'accepted'))
        throw new ValidationError('Accept all four documents first.');
      if (detail.screeningStatus === 'hits')
        throw new ValidationError(
          'The screening found matches. Reject the case or ask for changes; a match cannot be approved.',
        );
      if (detail.screeningStatus !== 'clear' && !input.screeningCheckedByHand)
        throw new ValidationError(
          'The names were not cleared by the automatic screening. Check them against the sanctions lists by hand and confirm it.',
        );
      if (!detail.risk) throw new ValidationError('Set a risk level first.');
      if (detail.businessName === '' || detail.businessCountry === '' || detail.owners.length === 0)
        throw new ValidationError('The business details and the owners are needed.');
      const now = Date.now();
      const expiresAt = new Date(now + VERIFICATION_YEARS * 365 * DAY).toISOString();
      await setStatus(companyId, id, ['in_review'], {
        status: 'approved',
        decided_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        decision_reason: '',
      });
      const marked = await admin
        .from('sub_merchants')
        .update({ kyc_approved_until: expiresAt })
        .eq('company_id', companyId)
        .eq('id', detail.subMerchantId);
      if (marked.error) throw new InternalError(marked.error);
      await audit(actor, companyId, 'gateway.kyc_approved', id, {
        subMerchantId: detail.subMerchantId,
        screening: detail.screeningStatus,
        screeningCheckedByHand: input.screeningCheckedByHand,
        expiresAt,
      });
      return { expiresAt };
    }
    case 'request_changes':
    case 'reject': {
      if (detail.status !== 'in_review') throw new ValidationError('Start the review first.');
      const changes = input.action === 'request_changes';
      if (changes && !detail.documents.some((d) => d.status === 'rejected'))
        throw new ValidationError(
          'Mark at least one document as rejected, with a reason, before you ask for changes.',
        );
      await setStatus(companyId, id, ['in_review'], {
        status: changes ? 'changes_requested' : 'rejected',
        decision_reason: input.reason,
        decided_at: new Date().toISOString(),
      });
      if (!changes) {
        const cleared = await admin
          .from('sub_merchants')
          .update({ kyc_approved_until: null })
          .eq('company_id', companyId)
          .eq('id', detail.subMerchantId);
        if (cleared.error) throw new InternalError(cleared.error);
      }
      await audit(
        actor,
        companyId,
        changes ? 'gateway.kyc_changes_requested' : 'gateway.kyc_rejected',
        id,
      );
      return { done: true };
    }
  }
}

/** Opens one document for the reviewer. The view is logged first; if the log fails, nothing is read. */
export async function openKycDocument(
  actor: Actor,
  documentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('sub_merchant_kyc_documents')
    .select('id, file_id, file_name, mime_type, submission_id')
    .eq('company_id', companyId)
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const sub = await admin
    .from('sub_merchant_kyc')
    .select('status')
    .eq('company_id', companyId)
    .eq('id', String(data.submission_id))
    .maybeSingle();
  if (sub.error) throw new InternalError(sub.error);
  if (
    !sub.data ||
    !['submitted', 'in_review', 'changes_requested', 'approved'].includes(String(sub.data.status))
  )
    throw new NotFoundError();
  await getService('audit').record({
    action: 'gateway.kyc_document_viewed',
    resourceType: 'sub_merchant_kyc_document',
    resourceId: String(data.id),
    companyId,
    metadata: { by: actor.userId },
  });
  const file = await getService('storage').get(String(data.file_id));
  return { bytes: file.bytes, mimeType: String(data.mime_type), name: String(data.file_name) };
}
