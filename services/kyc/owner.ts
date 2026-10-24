// path: services/kyc/owner.ts
// KYC from the owner's side: the open submission, document upload, beneficial owners, submit. Documents are files in
// the storage contract (category "kyc", encrypted); the owners' personal details are encrypted with the kyc purpose.
// A document is never returned to the owner's browser after upload; the owner sees names and states only.
import 'server-only';
import sharp from 'sharp';
import { type z } from 'zod';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  DOC_TYPES,
  EXPIRY_WARNING_DAYS,
  MAX_DOC_BYTES,
  MIN_IMAGE,
  OPEN_STATUSES,
  ownersSchema,
  type uploadSchema,
  type DocType,
  type Owners,
  type SubmissionStatus,
} from '@/lib/kyc/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { recordMilestone } from '@/services/company/settings';
import type { Actor } from '@/types/contracts';

export interface DocumentView {
  id: string;
  docType: DocType;
  name: string;
  status: 'pending' | 'accepted' | 'rejected';
  rejectReason: string;
  expiresOn: string | null;
}

export interface KycView {
  submissionId: string | null;
  status: SubmissionStatus | 'none';
  round: number;
  decisionReason: string;
  expiresAt: string | null;
  documents: DocumentView[];
  owners: Owners['owners'];
  missing: DocType[];
  ready: boolean;
  version: number;
}

const SUBMISSION_COLUMNS =
  'id, status, round, decision_reason, expires_at, owners_encrypted, version';

async function currentSubmission(companyId: string): Promise<Record<string, unknown> | null> {
  const admin = getAdminSupabase();
  const open = await admin
    .from('kyc_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('company_id', companyId)
    .in('status', [...OPEN_STATUSES])
    .is('deleted_at', null)
    .maybeSingle();
  if (open.error) throw new InternalError(open.error);
  if (open.data) return open.data;
  const last = await admin
    .from('kyc_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw new InternalError(last.error);
  return last.data;
}

async function decryptOwners(companyId: string, stored: unknown): Promise<Owners['owners']> {
  if (!stored) return [];
  const bytes = await getService('encryption').decrypt('kyc', stored as never, companyId);
  const parsed = ownersSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data.owners : [];
}

export async function kycView(companyId: string): Promise<KycView> {
  const row = await currentSubmission(companyId);
  if (!row)
    return {
      submissionId: null,
      status: 'none',
      round: 1,
      decisionReason: '',
      expiresAt: null,
      documents: [],
      owners: [],
      missing: [...DOC_TYPES],
      ready: false,
      version: 0,
    };
  const docs = await getAdminSupabase()
    .from('kyc_documents')
    .select('id, doc_type, file_name, status, reject_reason, document_expires_on')
    .eq('submission_id', String(row.id))
    .is('deleted_at', null);
  if (docs.error) throw new InternalError(docs.error);
  const documents = (docs.data ?? []).map((d) => ({
    id: String(d.id),
    docType: String(d.doc_type) as DocType,
    name: String(d.file_name),
    status: String(d.status) as DocumentView['status'],
    rejectReason: String(d.reject_reason),
    expiresOn: d.document_expires_on ? String(d.document_expires_on) : null,
  }));
  const owners = await decryptOwners(companyId, row.owners_encrypted);
  const have = new Set(documents.filter((d) => d.status !== 'rejected').map((d) => d.docType));
  const missing = DOC_TYPES.filter((t) => !have.has(t));
  return {
    submissionId: String(row.id),
    status: String(row.status) as SubmissionStatus,
    round: Number(row.round),
    decisionReason: String(row.decision_reason),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    documents,
    owners,
    missing,
    ready: missing.length === 0 && owners.length > 0,
    version: Number(row.version),
  };
}

/** The editable submission of the company, created on first use. A decided submission is never edited. */
async function editableSubmission(
  companyId: string,
): Promise<{ id: string; status: SubmissionStatus; round: number }> {
  const row = await currentSubmission(companyId);
  if (
    row &&
    (row.status === 'draft' || row.status === 'changes_requested' || row.status === 'rejected')
  ) {
    if (row.status === 'rejected') return startAgain(companyId, Number(row.round) + 1);
    return {
      id: String(row.id),
      status: String(row.status) as SubmissionStatus,
      round: Number(row.round),
    };
  }
  if (row && (row.status === 'submitted' || row.status === 'in_review'))
    throw new ValidationError(
      'Your documents are being reviewed. You can change them when the review asks for it.',
    );
  if (
    row &&
    row.status === 'approved' &&
    !(
      row.expires_at &&
      Date.parse(String(row.expires_at)) - Date.now() <= EXPIRY_WARNING_DAYS * 86_400_000
    )
  )
    throw new ValidationError(
      'Your business is already verified. You can renew it in the last 30 days.',
    );
  return startAgain(companyId, row ? Number(row.round) + 1 : 1);
}

async function startAgain(
  companyId: string,
  round: number,
): Promise<{ id: string; status: SubmissionStatus; round: number }> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .insert({ company_id: companyId, round })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError();
    throw new InternalError(error);
  }
  return { id: String(data.id), status: 'draft', round };
}

export async function checkImage(bytes: Uint8Array, mime: string): Promise<void> {
  if (mime === 'application/pdf') return;
  const meta = await sharp(Buffer.from(bytes))
    .metadata()
    .catch(() => null);
  if (!meta?.width || !meta.height)
    throw new ValidationError('The image could not be read. Take a new photo.');
  if (
    Math.max(meta.width, meta.height) < MIN_IMAGE.width ||
    Math.min(meta.width, meta.height) < MIN_IMAGE.height
  )
    throw new ValidationError(
      `The image is too small to read (at least ${MIN_IMAGE.width} by ${MIN_IMAGE.height} pixels). Take a closer, sharper photo.`,
    );
}

export async function uploadDocument(
  actor: Actor,
  input: z.infer<typeof uploadSchema>,
): Promise<DocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  if (bytes.length > MAX_DOC_BYTES) throw new ValidationError('The file is larger than 5 MB.');
  if (input.expiresOn && Date.parse(input.expiresOn) <= Date.now())
    throw new ValidationError('This document has expired. Use a valid one.');
  await checkImage(bytes, input.mimeType);
  const submission = await editableSubmission(companyId);
  const storage = getService('storage');
  const record = await storage.put({
    companyId,
    category: 'kyc',
    name: input.name,
    bytes,
    mimeType: input.mimeType,
  });
  const admin = getAdminSupabase();
  // A newer upload of the same type replaces the earlier one (the earlier file is removed from storage).
  const old = await admin
    .from('kyc_documents')
    .select('id, file_id')
    .eq('submission_id', submission.id)
    .eq('doc_type', input.docType)
    .is('deleted_at', null)
    .maybeSingle();
  if (old.error) throw new InternalError(old.error);
  if (old.data) {
    const gone = await admin
      .from('kyc_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(old.data.id))
      .eq('company_id', companyId);
    if (gone.error) throw new InternalError(gone.error);
    await storage.remove(String(old.data.file_id)).catch(() => undefined);
  }
  const hash = record.contentHash || (await sha256Hex(bytes));
  const dup = await admin.rpc('kd_kyc_duplicate_of', { p_company: companyId, p_hash: hash });
  const { data, error } = await admin
    .from('kyc_documents')
    .insert({
      company_id: companyId,
      submission_id: submission.id,
      doc_type: input.docType,
      file_id: record.id,
      file_name: input.name,
      mime_type: record.mimeType,
      content_hash: hash,
      document_expires_on: input.expiresOn,
      duplicate_of_company: typeof dup.data === 'string' ? dup.data : null,
    })
    .select('id, doc_type, file_name, status, reject_reason, document_expires_on')
    .single();
  if (error) throw new InternalError(error);
  if (typeof dup.data === 'string')
    await admin
      .from('kyc_submissions')
      .update({ duplicate_flag: true })
      .eq('id', submission.id)
      .eq('company_id', companyId);
  await getService('audit').record({
    action: 'kyc.document_uploaded',
    resourceType: 'kyc_document',
    resourceId: String(data.id),
    companyId,
    metadata: { docType: input.docType, by: actor.userId },
  });
  return {
    id: String(data.id),
    docType: input.docType,
    name: String(data.file_name),
    status: 'pending',
    rejectReason: '',
    expiresOn: data.document_expires_on ? String(data.document_expires_on) : null,
  };
}

export async function saveOwners(actor: Actor, input: Owners): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const submission = await editableSubmission(companyId);
  const payload = await getService('encryption').encrypt('kyc', JSON.stringify(input), companyId);
  const { error } = await getAdminSupabase()
    .from('kyc_submissions')
    .update({ owners_encrypted: payload })
    .eq('id', submission.id)
    .eq('company_id', companyId);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'kyc.owners_saved',
    resourceType: 'kyc_submission',
    resourceId: submission.id,
    companyId,
    metadata: { count: input.owners.length, by: actor.userId },
  });
}

export async function submitKyc(actor: Actor): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const view = await kycView(companyId);
  if (!view.submissionId || (view.status !== 'draft' && view.status !== 'changes_requested'))
    throw new ValidationError('There is nothing to submit.');
  if (!view.ready)
    throw new ValidationError('Upload all four documents and add at least one owner first.');
  if (view.documents.some((d) => d.status === 'rejected'))
    throw new ValidationError('Replace the documents that were rejected first.');
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), decision_reason: '' })
    .eq('id', view.submissionId)
    .eq('company_id', companyId)
    .in('status', ['draft', 'changes_requested'])
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await getService('events').publish({
    name: 'kyc.submitted',
    companyId,
    payload: { submissionId: view.submissionId, round: view.round },
  });
  await recordMilestone(companyId, 'kyc_submitted').catch(() => undefined);
  await getService('audit').record({
    action: 'kyc.submitted',
    resourceType: 'kyc_submission',
    resourceId: view.submissionId,
    companyId,
    metadata: { round: view.round, by: actor.userId },
  });
}

export async function assertOwnSubmission(companyId: string, submissionId: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .select('id')
    .eq('id', submissionId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
}
