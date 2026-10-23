// path: services/esign/sign.ts
// The signing page's logic: what a signer sees, the first look (marks the contract viewed), signing and declining.
// The rules (open contract, signer's turn, same wording, one signature each) are enforced in the database function, so
// two quick clicks or two browsers cannot sign twice.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getContract, type ContractView } from '@/services/contract/contracts';
import { addEvent, inviteNextSigner, revokeTokens } from '@/services/contract/send';
import { isOpen } from '@/services/contract/status';
import { captureEvidence, type PortalSubject } from '@/services/portal/events';
import { finalizeContract } from './finalize';
import { normalizeSignatureImage } from './images';
import type { SignBody } from './schemas';
import { SIGNATURE_STATEMENT, statementHash } from './statement';

const log = createLogger({ component: 'esign' });

export interface SigningView {
  contract: {
    id: string;
    number: string;
    title: string;
    bodyHtml: string;
    bodyHash: string;
    clientName: string;
    signBy: string | null;
    status: ContractView['status'];
  };
  signer: { id: string; name: string; email: string; roleLabel: string; status: string };
  others: { position: number; name: string; status: string }[];
  canSign: boolean;
  /** Sequential contracts: the name of the signer whose turn comes first. */
  waitingFor: string | null;
  statement: string;
  /** The signed copy can be downloaded. */
  hasSignedCopy: boolean;
}

async function loadSigner(
  subject: PortalSubject,
): Promise<{ contract: ContractView; signerId: string }> {
  const { data, error } = await getAdminSupabase()
    .from('contract_signers')
    .select('id, contract_id')
    .eq('id', subject.docId)
    .eq('company_id', subject.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const contract = await getContract(subject.companyId, String(data.contract_id));
  // A contract that was never sent is not shown to anybody outside the company.
  if (contract.status === 'draft' || !contract.bodyHash) throw new NotFoundError();
  return { contract, signerId: String(data.id) };
}

/** The first look at the page: the signer and the contract are marked as viewed (once). */
async function markViewed(
  subject: PortalSubject,
  contract: ContractView,
  signerStatus: string,
): Promise<void> {
  const admin = getAdminSupabase();
  if (signerStatus === 'pending' && isOpen(contract.status)) {
    const moved = await admin
      .from('contract_signers')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', subject.docId)
      .eq('status', 'pending')
      .select('id');
    if (moved.data && moved.data.length > 0)
      await addEvent(subject.companyId, contract.id, 'viewed', '', subject.docId);
  }
  if (contract.status === 'sent')
    await admin
      .from('contracts')
      .update({ status: 'viewed' })
      .eq('id', contract.id)
      .eq('status', 'sent');
}

export async function getSigningView(subject: PortalSubject): Promise<SigningView> {
  const { contract } = await loadSigner(subject);
  const mine = contract.signers.find((s) => s.id === subject.docId);
  if (!mine || !contract.bodyHash) throw new NotFoundError();
  await markViewed(subject, contract, mine.status);
  const open = isOpen(contract.status) && (mine.status === 'pending' || mine.status === 'viewed');
  const blocker =
    contract.signingOrder === 'sequential'
      ? (contract.signers.find((s) => s.position < mine.position && s.status !== 'signed') ?? null)
      : null;
  return {
    contract: {
      id: contract.id,
      number: contract.number,
      title: contract.title,
      bodyHtml: contract.bodyHtml,
      bodyHash: contract.bodyHash,
      clientName: contract.clientName,
      signBy: contract.signBy,
      status: contract.status,
    },
    signer: {
      id: mine.id,
      name: mine.name,
      email: mine.email,
      roleLabel: mine.roleLabel,
      status: mine.status,
    },
    others: contract.signers
      .filter((s) => s.id !== mine.id)
      .map((s) => ({ position: s.position, name: s.name, status: s.status })),
    canSign: open && blocker === null,
    waitingFor: open && blocker ? blocker.name : null,
    statement: SIGNATURE_STATEMENT,
    hasSignedCopy: contract.status === 'signed',
  };
}

function mapSignError(error: { code?: string; message?: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new NotFoundError();
    case '22023':
    case '23505':
      throw new ValidationError('This contract can no longer be signed by you.');
    case '55000':
      throw new ValidationError('It is not your turn yet. You will get a message when it is.');
    case '22000':
      throw new ValidationError(
        'The contract changed after you opened it. Reload the page and read it again.',
      );
    default:
      throw new InternalError(error);
  }
}

export async function signContract(
  subject: PortalSubject,
  input: SignBody,
): Promise<{ status: ContractView['status'] }> {
  const { contract } = await loadSigner(subject);
  const admin = getAdminSupabase();
  let imageId: string | null = null;
  let imageHash: string | null = null;
  if (input.method !== 'typed' && input.image) {
    const image = await normalizeSignatureImage(input.image);
    const stored = await getService('storage').put({
      companyId: subject.companyId,
      category: 'contract',
      name: `signature-${subject.docId}.png`,
      bytes: image.bytes,
      mimeType: 'image/png',
    });
    imageId = stored.id;
    imageHash = image.hash;
  }
  const evidence = await captureEvidence(subject.companyId);
  const { data, error } = await admin.rpc('kd_contract_sign', {
    p_company: subject.companyId,
    p_signer: subject.docId,
    p_doc_hash: input.docHash,
    p_method: input.method,
    p_typed_name: input.typedName,
    p_image_file: imageId,
    p_image_hash: imageHash,
    p_statement: SIGNATURE_STATEMENT,
    p_statement_hash: await statementHash(),
    p_ip_masked: evidence.ip_masked,
    p_ip_hash: evidence.ip_hash,
    p_ip_enc: evidence.ip_enc,
    p_agent: evidence.user_agent,
    p_device: evidence.device,
    p_token: subject.tokenId,
  });
  if (error) {
    if (imageId)
      await getService('storage')
        .remove(imageId)
        .catch(() => undefined);
    mapSignError(error);
  }
  const status = String(data) as ContractView['status'];
  try {
    if (status === 'signed') await finalizeContract(subject.companyId, contract.id);
    else if (contract.signingOrder === 'sequential')
      await inviteNextSigner(subject.companyId, contract.id);
  } catch {
    // The signature is saved; the daily job finishes the copy and a reminder invites the next signer.
    log.error('follow-up after signing failed', { contract: contract.id });
  }
  return { status };
}

export async function declineContract(subject: PortalSubject, reason: string): Promise<void> {
  const { contract } = await loadSigner(subject);
  const { error } = await getAdminSupabase().rpc('kd_contract_decline', {
    p_company: subject.companyId,
    p_signer: subject.docId,
    p_reason: reason,
  });
  if (error) mapSignError(error);
  await revokeTokens(contract);
  await getService('notification')
    .notify({
      companyId: subject.companyId,
      type: 'contract.declined',
      title: 'A signer declined a contract',
      body: `${contract.number} ${contract.title} was declined.`,
      href: `/contracts/${contract.id}`,
    })
    .catch(() => undefined);
}

/** The stored signed copy, for a signer of a fully signed contract. */
export async function getSignedCopy(
  subject: PortalSubject,
): Promise<{ bytes: Uint8Array; name: string }> {
  const { contract } = await loadSigner(subject);
  if (contract.status !== 'signed') throw new NotFoundError();
  let { data } = await getAdminSupabase()
    .from('contracts')
    .select('archived_file_id')
    .eq('id', contract.id)
    .eq('company_id', subject.companyId)
    .maybeSingle();
  if (!data?.archived_file_id) {
    await finalizeContract(subject.companyId, contract.id).catch(() => undefined);
    ({ data } = await getAdminSupabase()
      .from('contracts')
      .select('archived_file_id')
      .eq('id', contract.id)
      .eq('company_id', subject.companyId)
      .maybeSingle());
  }
  if (!data?.archived_file_id) throw new NotFoundError();
  const file = await getService('storage').get(String(data.archived_file_id));
  if (file.record.companyId !== subject.companyId) throw new NotFoundError();
  return { bytes: file.bytes, name: `${contract.number}-signed.pdf` };
}
