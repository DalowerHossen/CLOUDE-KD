// path: services/esign/finalize.ts
// When the last signer has signed: the signed PDF is drawn, stored through the storage contract (the company's Google
// Drive when linked, otherwise Supabase Storage, both encrypted), its checksum and the seal are kept on the contract, and
// every signer gets a link to their copy. The step can be run again safely; the daily job retries a contract whose PDF
// is still missing.
import 'server-only';
import { createElement } from 'react';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { htmlToText } from '@/lib/email/content';
import { createLogger } from '@/lib/logger';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { getContract } from '@/services/contract/contracts';
import { companyName, contractLink } from '@/services/contract/send';
import { sendClientMail } from '@/services/portal/client-mail';
import { SignedContractPdf, type SignedSigner } from './contract-pdf';
import { computeSeal, verifySeal, type SealParts } from './seal';
import { SIGNATURE_STATEMENT, statementHash } from './statement';

const log = createLogger({ component: 'esign-finalize' });

interface SignatureRow {
  signer_id: string;
  method: 'typed' | 'drawn' | 'uploaded';
  typed_name: string;
  image_file_id: string | null;
  image_hash: string | null;
  doc_hash: string;
  ip_masked: string | null;
  device: string | null;
  signed_at: string;
}

async function loadSignatures(companyId: string, contractId: string): Promise<SignatureRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('signatures')
    .select(
      'signer_id, method, typed_name, image_file_id, image_hash, doc_hash, ip_masked, device, signed_at',
    )
    .eq('company_id', companyId)
    .eq('contract_id', contractId)
    .order('signed_at', { ascending: true });
  if (error) throw new InternalError(error);
  return (data ?? []) as SignatureRow[];
}

/** Checksum of one signature record: who, how, when, which wording, which picture. */
export async function recordHash(row: SignatureRow): Promise<string> {
  return sha256Hex(
    [
      row.signer_id,
      row.typed_name,
      row.method,
      row.signed_at,
      row.doc_hash,
      row.image_hash ?? '',
    ].join('|'),
  );
}

async function sealParts(
  contractId: string,
  docHash: string,
  archiveHash: string,
  rows: SignatureRow[],
): Promise<SealParts> {
  return { contractId, docHash, archiveHash, signatures: await Promise.all(rows.map(recordHash)) };
}

export async function finalizeContract(companyId: string, contractId: string): Promise<boolean> {
  const contract = await getContract(companyId, contractId);
  if (contract.status !== 'signed' || !contract.bodyHash || !contract.sentAt || !contract.signedAt)
    throw new ValidationError('The contract is not fully signed.');
  const admin = getAdminSupabase();
  const { data: existing } = await admin
    .from('contracts')
    .select('archived_file_id')
    .eq('id', contractId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing?.archived_file_id) return false;

  const rows = await loadSignatures(companyId, contractId);
  const byId = new Map(rows.map((r) => [r.signer_id, r]));
  const signers: SignedSigner[] = [];
  for (const signer of contract.signers) {
    const row = byId.get(signer.id);
    if (!row) throw new ValidationError('A signature is missing.');
    let image: SignedSigner['image'] = null;
    if (row.image_file_id) {
      const file = await getService('storage').get(row.image_file_id);
      if (file.record.companyId !== companyId) throw new NotFoundError();
      image = { data: Buffer.from(file.bytes), format: 'png' };
    }
    signers.push({
      position: signer.position,
      name: signer.name,
      email: signer.email,
      roleLabel: signer.roleLabel,
      method: row.method,
      typedName: row.typed_name,
      signedAt: row.signed_at,
      ipMasked: row.ip_masked ?? '',
      device: row.device ?? '',
      recordHash: await recordHash(row),
      image,
    });
  }
  const company = await companyName(companyId);
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const rendered = await renderPdf(
    createElement(SignedContractPdf, {
      data: {
        number: contract.number,
        title: contract.title,
        companyName: company,
        clientName: contract.clientName,
        paragraphs: htmlToText(contract.bodyHtml)
          .split('\n')
          .filter((p) => p.trim() !== ''),
        docHash: contract.bodyHash,
        sentAt: contract.sentAt,
        signedAt: contract.signedAt,
        statement: SIGNATURE_STATEMENT,
        statementHash: await statementHash(),
        signers,
      },
    }),
  );
  const archiveHash = await sha256Hex(rendered.bytes);
  const stored = await getService('storage').put({
    companyId,
    category: 'contract',
    name: `${contract.number}-signed.pdf`,
    bytes: rendered.bytes,
    mimeType: 'application/pdf',
  });
  const seal = await computeSeal(
    getServerEnv().HMAC_TOKEN_SECRET,
    await sealParts(contractId, contract.bodyHash, archiveHash, rows),
  );
  const { data: saved, error } = await admin
    .from('contracts')
    .update({ archived_file_id: stored.id, archive_hash: archiveHash, seal })
    .eq('id', contractId)
    .eq('company_id', companyId)
    .is('archived_file_id', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!saved || saved.length === 0) {
    await getService('storage')
      .remove(stored.id)
      .catch(() => undefined);
    return false;
  }
  await notifyCopies(companyId, contract.id, contract.title, contract.number, company);
  return true;
}

/** Every signer gets a fresh link to their copy (links are shown once, so a new one is made). */
async function notifyCopies(
  companyId: string,
  contractId: string,
  title: string,
  number: string,
  company: string,
): Promise<void> {
  const contract = await getContract(companyId, contractId);
  const { data } = await getAdminSupabase()
    .from('contract_signers')
    .select('id, token_id')
    .eq('contract_id', contractId)
    .is('deleted_at', null);
  const tokenOf = new Map(
    (data ?? []).map((r) => [String(r.id), r.token_id ? String(r.token_id) : null]),
  );
  for (const signer of contract.signers) {
    const tokenId = tokenOf.get(signer.id);
    if (!tokenId) continue;
    try {
      const issued = await getService('tokens').reissue(tokenId);
      await sendClientMail({
        companyId,
        template: 'client.contract-signed',
        to: signer.email,
        data: {
          clientName: signer.name,
          companyName: company,
          title,
          number,
          link: contractLink(issued.token),
        },
        idempotencyKey: `contract-signed-${signer.id}-${issued.id}`,
        doc: { type: 'contract', id: contractId },
        clientId: contract.clientId,
        tokenId: issued.id,
      });
    } catch {
      log.error('signed copy message failed', { contract: contractId });
    }
  }
  await getService('notification')
    .notify({
      companyId,
      type: 'contract.signed',
      title: 'A contract was signed by everyone',
      body: `${number} ${title} is signed and stored.`,
      href: `/contracts/${contractId}`,
    })
    .catch(() => undefined);
}

export interface SealCheck {
  ok: boolean;
  reasons: string[];
}

/** Checks a signed contract: the stored file still has its checksum, every signature record is intact, the seal matches. */
export async function verifySignedContract(
  companyId: string,
  contractId: string,
): Promise<SealCheck> {
  const reasons: string[] = [];
  const { data } = await getAdminSupabase()
    .from('contracts')
    .select('body_hash, archived_file_id, archive_hash, seal')
    .eq('id', contractId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!data?.archived_file_id || !data.archive_hash || !data.seal || !data.body_hash)
    return { ok: false, reasons: ['The contract has no sealed copy yet.'] };
  const file = await getService('storage').get(String(data.archived_file_id));
  if ((await sha256Hex(file.bytes)) !== data.archive_hash)
    reasons.push('The stored file was changed.');
  const rows = await loadSignatures(companyId, contractId);
  if (rows.some((r) => r.doc_hash !== data.body_hash))
    reasons.push('A signature belongs to other wording.');
  const parts = await sealParts(
    contractId,
    String(data.body_hash),
    String(data.archive_hash),
    rows,
  );
  if (!(await verifySeal(getServerEnv().HMAC_TOKEN_SECRET, parts, String(data.seal))))
    reasons.push('The seal does not match.');
  return { ok: reasons.length === 0, reasons };
}

/** Signed contracts whose PDF could not be made yet (for the daily job). */
export async function finalizePending(limit = 50): Promise<number> {
  const { data } = await getAdminSupabase()
    .from('contracts')
    .select('id, company_id')
    .eq('status', 'signed')
    .is('archived_file_id', null)
    .is('deleted_at', null)
    .limit(limit);
  let done = 0;
  for (const row of data ?? []) {
    try {
      if (await finalizeContract(String(row.company_id), String(row.id))) done += 1;
    } catch {
      log.error('contract finalize failed', {});
    }
  }
  return done;
}
