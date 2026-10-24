// path: services/evidence/packs.ts
// Making, storing, listing and reading evidence packs. A pack is a PDF and a ZIP (the PDF, the sent invoice, the receipt,
// all the collected data as JSON, the processor's own evidence format when its adapter has one, and a manifest with the
// checksum of every file). Both go through the storage contract (encrypted; the company's Google Drive when linked). The
// checksums are written to the audit chain, so a pack can be shown to be the one that was made.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { loadAdapter } from '@/lib/payment/registry';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { addDisputeEvent, applyMove, getDispute } from '@/services/dispute/disputes';
import { isClosed } from '@/services/dispute/status';
import { renderReceiptPdf } from '@/services/portal/receipt-view';
import type { Actor } from '@/types/contracts';
import { collectEvidence } from './collect';
import { renderEvidencePackPdf } from './render';
import { PACK_RETENTION_MONTHS, processorSections } from './facts';
import { sectionsPresent, type EvidencePackData } from './types';
import { buildZip, type ZipFile } from './zip';

const log = createLogger({ component: 'evidence-packs' });

export interface PackView {
  id: string;
  versionNo: number;
  createdAt: string;
  retainUntil: string;
  pdfHash: string;
  zipHash: string;
  sections: Record<string, boolean>;
  files: { name: string; sha256: string; size: number }[];
  processorFormat: boolean;
}

interface ManifestFile {
  name: string;
  sha256: string;
  size: number;
}

async function processorFormat(data: EvidencePackData): Promise<Record<string, unknown> | null> {
  try {
    const adapter = await loadAdapter(data.dispute.processorId);
    if (!adapter.evidenceFormat) return null;
    return await adapter.evidenceFormat({
      disputeId: data.dispute.processorDisputeId ?? data.dispute.id,
      processorTransactionId: data.receipt?.processorTransactionId ?? '',
      reasonCode: data.dispute.reasonCode,
      sections: processorSections(data),
    });
  } catch {
    log.error('processor evidence format failed', { processor: data.dispute.processorId });
    return null;
  }
}

const enc = new TextEncoder();
const json = (value: unknown): Uint8Array => enc.encode(`${JSON.stringify(value, null, 2)}\n`);

function readme(data: EvidencePackData, files: ManifestFile[]): string {
  return [
    `Evidence pack for invoice ${data.invoice.number} (${data.platform.companyName})`,
    `Made ${data.generatedAt} by ${data.platform.name}.`,
    '',
    'Files:',
    ...files.map((f) => `- ${f.name}  (${f.size} bytes, SHA-256 ${f.sha256})`),
    '',
    'manifest.json lists the same checksums. The checksums of the PDF and of this ZIP are also written to the platform audit chain.',
    'No card number is part of this pack.',
    '',
  ].join('\n');
}

export async function generateEvidencePack(actor: Actor, disputeId: string): Promise<PackView> {
  if (!actor.companyId) throw new NotFoundError();
  const companyId = actor.companyId;
  const dispute = await getDispute(companyId, disputeId);
  if (isClosed(dispute.status)) throw new ValidationError('This case is closed.');
  const data = await collectEvidence(companyId, disputeId);
  const pdf = await renderEvidencePackPdf(data);

  const files: ZipFile[] = [{ name: 'evidence-pack.pdf', bytes: pdf }];
  if (data.invoice.snapshotFileId) {
    const stored = await getService('storage').get(data.invoice.snapshotFileId);
    if (stored.record.companyId === companyId)
      files.push({ name: 'invoice-as-sent.pdf', bytes: stored.bytes });
  }
  if (data.receipt) {
    const receipt = await renderReceiptPdf(companyId, dispute.paymentId).catch(() => null);
    if (receipt) files.push({ name: 'receipt.pdf', bytes: receipt.bytes });
  }
  files.push({ name: 'data.json', bytes: json(data) });
  const format = await processorFormat(data);
  if (format) files.push({ name: 'processor-format.json', bytes: json(format) });
  const listed: ManifestFile[] = [];
  for (const f of files)
    listed.push({ name: f.name, sha256: await sha256Hex(f.bytes), size: f.bytes.length });
  files.push({
    name: 'manifest.json',
    bytes: json({ version: 1, generatedAt: data.generatedAt, files: listed }),
  });
  files.push({ name: 'README.txt', bytes: enc.encode(readme(data, listed)) });
  const zip = buildZip(files);

  const storage = getService('storage');
  const last = await getAdminSupabase()
    .from('evidence_packs')
    .select('version_no')
    .eq('dispute_id', disputeId)
    .eq('company_id', companyId)
    .order('version_no', { ascending: false })
    .limit(1);
  const versionNo = Number(last.data?.[0]?.version_no ?? 0) + 1;
  const base = `dispute-${disputeId.slice(0, 8)}-pack-v${versionNo}`;
  const pdfRecord = await storage.put({
    companyId,
    category: 'evidence',
    name: `${base}.pdf`,
    bytes: pdf,
    mimeType: 'application/pdf',
  });
  const zipRecord = await storage.put({
    companyId,
    category: 'evidence',
    name: `${base}.zip`,
    bytes: zip,
    mimeType: 'application/zip',
  });
  const pdfHash = await sha256Hex(pdf);
  const zipHash = await sha256Hex(zip);
  const retainUntil = new Date();
  retainUntil.setUTCMonth(retainUntil.getUTCMonth() + PACK_RETENTION_MONTHS);
  const sections = sectionsPresent(data);
  const inserted = await getAdminSupabase()
    .from('evidence_packs')
    .insert({
      company_id: companyId,
      dispute_id: disputeId,
      version_no: versionNo,
      pdf_file_id: pdfRecord.id,
      zip_file_id: zipRecord.id,
      pdf_hash: pdfHash,
      zip_hash: zipHash,
      manifest: { version: 1, files: listed },
      sections,
      processor_id: data.dispute.processorId,
      processor_format: format !== null,
      retain_until: retainUntil.toISOString(),
      created_by: actor.userId,
    })
    .select('id, created_at')
    .single();
  if (inserted.error) {
    await storage.remove(pdfRecord.id).catch(() => undefined);
    await storage.remove(zipRecord.id).catch(() => undefined);
    if (inserted.error.code === '23505')
      throw new ValidationError('Another pack was made at the same time. Try again.');
    throw new InternalError(inserted.error);
  }
  await getAdminSupabase()
    .from('dispute_evidence')
    .insert({
      company_id: companyId,
      dispute_id: disputeId,
      kind: 'pack',
      title: `Evidence pack version ${versionNo}`,
      content: `PDF ${pdfHash}\nZIP ${zipHash}`,
      file_id: zipRecord.id,
      content_hash: zipHash,
      created_by: actor.userId,
    });
  await addDisputeEvent(
    companyId,
    disputeId,
    'evidence',
    `Evidence pack version ${versionNo} made`,
    actor.userId,
  );
  await getService('audit').record({
    action: 'dispute.evidence_pack_created',
    resourceType: 'dispute',
    resourceId: disputeId,
    companyId,
    metadata: {
      packId: String(inserted.data.id),
      versionNo,
      pdfHash,
      zipHash,
      files: listed.length,
    },
  });
  if (dispute.status === 'new')
    await applyMove(companyId, dispute, 'gathering', 'Evidence pack made', actor.userId).catch(
      () => undefined,
    );
  return {
    id: String(inserted.data.id),
    versionNo,
    createdAt: String(inserted.data.created_at),
    retainUntil: retainUntil.toISOString(),
    pdfHash,
    zipHash,
    sections,
    files: listed,
    processorFormat: format !== null,
  };
}

export async function listPacks(companyId: string, disputeId: string): Promise<PackView[]> {
  await getDispute(companyId, disputeId);
  const { data, error } = await getAdminSupabase()
    .from('evidence_packs')
    .select(
      'id, version_no, created_at, retain_until, pdf_hash, zip_hash, sections, manifest, processor_format',
    )
    .eq('dispute_id', disputeId)
    .eq('company_id', companyId)
    .order('version_no', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    versionNo: Number(r.version_no),
    createdAt: String(r.created_at),
    retainUntil: String(r.retain_until),
    pdfHash: String(r.pdf_hash),
    zipHash: String(r.zip_hash),
    sections: (r.sections ?? {}) as Record<string, boolean>,
    files: ((r.manifest as { files?: ManifestFile[] } | null)?.files ?? []) as ManifestFile[],
    processorFormat: r.processor_format === true,
  }));
}

/** The stored file of a pack, for people of the company who may read disputes. The checksum is checked before it is given. */
export async function readPackFile(
  companyId: string,
  packId: string,
  kind: 'pdf' | 'zip',
): Promise<{ bytes: Uint8Array; name: string; mimeType: string }> {
  const { data, error } = await getAdminSupabase()
    .from('evidence_packs')
    .select('dispute_id, version_no, pdf_file_id, zip_file_id, pdf_hash, zip_hash')
    .eq('id', packId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const file = await getService('storage').get(
    String(kind === 'pdf' ? data.pdf_file_id : data.zip_file_id),
  );
  if (file.record.companyId !== companyId) throw new NotFoundError();
  const expected = String(kind === 'pdf' ? data.pdf_hash : data.zip_hash);
  if ((await sha256Hex(file.bytes)) !== expected)
    throw new InternalError(new Error('The stored pack does not match its checksum.'));
  return {
    bytes: file.bytes,
    name: `dispute-${String(data.dispute_id).slice(0, 8)}-pack-v${Number(data.version_no)}.${kind}`,
    mimeType: kind === 'pdf' ? 'application/pdf' : 'application/zip',
  };
}
