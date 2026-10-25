// path: services/gateway/kyc-applicant.ts
// KYC from the sub-merchant's side, reached through the secure link: the business, the owners (sealed), the four documents and the
// submit. The documents are files in the storage service (category "kyc", encrypted, under the main merchant's company); a document
// is never returned to the applicant. A submission that is being reviewed or approved is read only.
import 'server-only';
import { type z } from 'zod';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import {
  applicantMode,
  isReady,
  kycBusinessInput,
  missingDocuments,
  shownStatus,
} from '@/lib/gateway/kyc-rules';
import {
  DOC_TYPES,
  MAX_DOC_BYTES,
  OPEN_STATUSES,
  ownersSchema,
  type DocType,
  type Owners,
  type SubmissionStatus,
  type uploadSchema,
} from '@/lib/kyc/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { checkImage, type DocumentView, type KycView } from '@/services/kyc/owner';
import type { ResolvedLink } from './kyc-links';

export interface ApplicantView extends KycView {
  subMerchantName: string;
  businessName: string;
  businessCountry: string;
}

const COLUMNS =
  'id, status, round, decision_reason, expires_at, owners_encrypted, business_name, business_country, version';

async function currentRow(link: ResolvedLink): Promise<Record<string, unknown> | null> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .select(COLUMNS)
    .eq('company_id', link.companyId)
    .eq('sub_merchant_id', link.subMerchantId)
    .is('deleted_at', null)
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data;
}

async function openOwners(companyId: string, stored: unknown): Promise<Owners['owners']> {
  if (!stored) return [];
  const bytes = await getService('encryption').decrypt('kyc', stored as never, companyId);
  const parsed = ownersSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data.owners : [];
}

async function documentsOf(link: ResolvedLink, submissionId: string): Promise<DocumentView[]> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc_documents')
    .select('id, doc_type, file_name, mime_type, status, reject_reason, document_expires_on')
    .eq('company_id', link.companyId)
    .eq('submission_id', submissionId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return (data ?? []).map((d) => ({
    id: String(d.id),
    docType: String(d.doc_type) as DocType,
    name: String(d.file_name),
    mimeType: String(d.mime_type),
    status: String(d.status) as DocumentView['status'],
    rejectReason: String(d.reject_reason),
    expiresOn: d.document_expires_on ? String(d.document_expires_on) : null,
  }));
}

export async function applicantView(link: ResolvedLink): Promise<ApplicantView> {
  const row = await currentRow(link);
  const base = { subMerchantName: link.subMerchantName };
  if (!row)
    return {
      ...base,
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
      businessName: '',
      businessCountry: '',
    };
  const documents = await documentsOf(link, String(row.id));
  const owners = await openOwners(link.companyId, row.owners_encrypted);
  const businessName = row.business_name ? String(row.business_name) : '';
  const businessCountry = row.business_country ? String(row.business_country) : '';
  const input = {
    businessName: businessName || null,
    businessCountry: businessCountry || null,
    ownerCount: owners.length,
    documents,
  };
  return {
    ...base,
    submissionId: String(row.id),
    status: shownStatus(
      String(row.status) as SubmissionStatus,
      row.expires_at ? String(row.expires_at) : null,
      new Date(),
    ),
    round: Number(row.round),
    decisionReason: String(row.decision_reason),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    documents,
    owners,
    missing: missingDocuments(input),
    ready: isReady(input),
    version: Number(row.version),
    businessName,
    businessCountry,
  };
}

/** The submission the applicant may change, made on first use; a rejected or expired one starts a new round. */
async function editable(link: ResolvedLink): Promise<{ id: string; round: number }> {
  const row = await currentRow(link);
  const status = row ? (String(row.status) as SubmissionStatus) : 'none';
  const mode = applicantMode(status, row?.expires_at ? String(row.expires_at) : null, new Date());
  if (mode === 'locked')
    throw new ValidationError(
      status === 'approved'
        ? 'This business is already verified. You can renew it in the last 30 days.'
        : 'The documents are being reviewed. You can change them when the review asks for it.',
    );
  if (row && mode === 'edit' && OPEN_STATUSES.includes(status as SubmissionStatus))
    return { id: String(row.id), round: Number(row.round) };
  const round = row ? Number(row.round) + 1 : 1;
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .insert({ company_id: link.companyId, sub_merchant_id: link.subMerchantId, round })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError();
    throw new InternalError(error);
  }
  return { id: String(data.id), round };
}

async function audit(
  link: ResolvedLink,
  action: string,
  resourceType: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType,
    resourceId: id,
    companyId: link.companyId,
    metadata: { ...metadata, via: 'sub_merchant_link', linkId: link.linkId },
  });
}

export async function saveBusiness(link: ResolvedLink, input: unknown): Promise<void> {
  const parsed = kycBusinessInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'The business details are not valid.',
    );
  const submission = await editable(link);
  const { error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .update({ business_name: parsed.data.businessName, business_country: parsed.data.country })
    .eq('id', submission.id)
    .eq('company_id', link.companyId);
  if (error) throw new InternalError(error);
  await audit(link, 'gateway.kyc_business_saved', 'sub_merchant_kyc', submission.id, {
    country: parsed.data.country,
  });
}

export async function saveOwnersOfLink(link: ResolvedLink, input: Owners): Promise<void> {
  const submission = await editable(link);
  const payload = await getService('encryption').encrypt(
    'kyc',
    JSON.stringify(input),
    link.companyId,
  );
  const { error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .update({ owners_encrypted: payload })
    .eq('id', submission.id)
    .eq('company_id', link.companyId);
  if (error) throw new InternalError(error);
  await audit(link, 'gateway.kyc_owners_saved', 'sub_merchant_kyc', submission.id, {
    count: input.owners.length,
  });
}

export async function uploadDocumentOfLink(
  link: ResolvedLink,
  input: z.infer<typeof uploadSchema>,
): Promise<DocumentView> {
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  if (bytes.length > MAX_DOC_BYTES) throw new ValidationError('The file is larger than 5 MB.');
  if (input.expiresOn && Date.parse(input.expiresOn) <= Date.now())
    throw new ValidationError('This document has expired. Use a valid one.');
  await checkImage(bytes, input.mimeType);
  const submission = await editable(link);
  const storage = getService('storage');
  const record = await storage.put({
    companyId: link.companyId,
    category: 'kyc',
    name: input.name,
    bytes,
    mimeType: input.mimeType,
  });
  const admin = getAdminSupabase();
  const old = await admin
    .from('sub_merchant_kyc_documents')
    .select('id, file_id')
    .eq('company_id', link.companyId)
    .eq('submission_id', submission.id)
    .eq('doc_type', input.docType)
    .is('deleted_at', null)
    .maybeSingle();
  if (old.error) throw new InternalError(old.error);
  if (old.data) {
    const gone = await admin
      .from('sub_merchant_kyc_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(old.data.id))
      .eq('company_id', link.companyId);
    if (gone.error) throw new InternalError(gone.error);
    await storage.remove(String(old.data.file_id)).catch(() => undefined);
  }
  const { data, error } = await admin
    .from('sub_merchant_kyc_documents')
    .insert({
      company_id: link.companyId,
      submission_id: submission.id,
      doc_type: input.docType,
      file_id: record.id,
      file_name: input.name,
      mime_type: record.mimeType,
      content_hash: record.contentHash || (await sha256Hex(bytes)),
      document_expires_on: input.expiresOn,
    })
    .select('id, doc_type, file_name, mime_type, status, reject_reason, document_expires_on')
    .single();
  if (error) throw new InternalError(error);
  await audit(link, 'gateway.kyc_document_uploaded', 'sub_merchant_kyc_document', String(data.id), {
    docType: input.docType,
  });
  return {
    id: String(data.id),
    docType: input.docType,
    name: String(data.file_name),
    mimeType: String(data.mime_type),
    status: 'pending',
    rejectReason: '',
    expiresOn: data.document_expires_on ? String(data.document_expires_on) : null,
  };
}

export async function submitOfLink(link: ResolvedLink): Promise<void> {
  const view = await applicantView(link);
  if (!view.submissionId || (view.status !== 'draft' && view.status !== 'changes_requested'))
    throw new ValidationError('There is nothing to submit.');
  if (!view.ready)
    throw new ValidationError(
      'Add the business details and at least one owner, and upload all four documents first.',
    );
  if (view.documents.some((d) => d.status === 'rejected'))
    throw new ValidationError('Replace the documents that were rejected first.');
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_kyc')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), decision_reason: '' })
    .eq('id', view.submissionId)
    .eq('company_id', link.companyId)
    .in('status', ['draft', 'changes_requested'])
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await audit(link, 'gateway.kyc_submitted', 'sub_merchant_kyc', view.submissionId, {
    round: view.round,
  });
}
