// path: services/invoice/snapshots.ts
// Invoice PDFs. `renderInvoicePdf` draws the invoice as it is now (drafts show a DRAFT watermark). `snapshotInvoice`
// stores the PDF made when the invoice was sent: encrypted through the storage contract, with its checksum and the
// drawn data, never changed afterwards. A job fills in snapshots that failed at send time.
import 'server-only';
import sharp from 'sharp';
import { createElement } from 'react';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { InvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfData, type PdfInvoiceData } from '@/lib/pdf/invoice/data';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { getInvoice } from './invoices';
import { buildSeller } from './seller';

export async function logoOf(
  companyId: string,
  fileId: string | null,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!fileId) return null;
  try {
    const file = await getService('storage').get(fileId);
    if (file.record.companyId !== companyId || file.record.category !== 'logo') return null;
    const small = await sharp(file.bytes)
      .resize({ width: 320, height: 192, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return { bytes: new Uint8Array(small), mimeType: 'image/png' };
  } catch {
    return null;
  }
}

export async function invoicePdfData(
  companyId: string,
  invoiceId: string,
): Promise<PdfInvoiceData> {
  const invoice = await getInvoice(companyId, invoiceId, { includeTrashed: true });
  const seller = invoice.seller ? null : await buildSeller(companyId);
  return buildInvoicePdfData(invoice, seller ?? {});
}

export async function renderInvoicePdf(
  companyId: string,
  invoiceId: string,
): Promise<{ bytes: Uint8Array; sha256: string; data: PdfInvoiceData }> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const invoice = await getInvoice(companyId, invoiceId, { includeTrashed: true });
  const live = invoice.seller ? null : await buildSeller(companyId);
  const data = buildInvoicePdfData(invoice, live ?? {});
  const logoFileId =
    ((invoice.seller ?? live) as { logoFileId?: string | null } | null)?.logoFileId ??
    (await getSection(companyId, 'branding')).value.logoFileId;
  const logo = await logoOf(companyId, logoFileId ?? null);
  const out = await renderPdf(createElement(InvoicePdf, { data, logo }));
  return { bytes: out.bytes, sha256: out.sha256, data };
}

export interface SnapshotResult {
  fileId: string;
  contentHash: string;
}

/** Stores the PDF of a sent invoice. Safe to call again: the first snapshot for a reason is kept. */
export async function snapshotInvoice(
  companyId: string,
  invoiceId: string,
  reason: 'sent' | 'paid' | 'voided' | 'manual' = 'sent',
  by: string | null = null,
): Promise<SnapshotResult> {
  const admin = getAdminSupabase();
  const invoice = await getInvoice(companyId, invoiceId, { includeTrashed: true });
  if (invoice.status === 'draft' || invoice.status === 'pending_approval')
    throw new ValidationError('Only an invoice that was sent has a snapshot.');
  if (reason !== 'manual') {
    const existing = await admin
      .from('invoice_snapshots')
      .select('file_id, content_hash')
      .eq('company_id', companyId)
      .eq('invoice_id', invoiceId)
      .eq('reason', reason)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.error) throw new InternalError(existing.error);
    if (existing.data)
      return {
        fileId: String(existing.data.file_id),
        contentHash: String(existing.data.content_hash),
      };
  }
  const out = await renderInvoicePdf(companyId, invoiceId);
  const record = await getService('storage').put({
    companyId,
    category: 'invoice',
    name: `${invoice.number ?? invoiceId}.pdf`,
    bytes: out.bytes,
    mimeType: 'application/pdf',
  });
  const ins = await admin
    .from('invoice_snapshots')
    .insert({
      company_id: companyId,
      invoice_id: invoiceId,
      file_id: record.id,
      content_hash: out.sha256,
      size_bytes: out.bytes.length,
      reason,
      data: out.data as unknown as Record<string, unknown>,
      created_by: by,
    })
    .select('file_id, content_hash')
    .single();
  if (ins.error) {
    if (ins.error.code === '23505') return snapshotInvoice(companyId, invoiceId, reason, by);
    throw new InternalError(ins.error);
  }
  return { fileId: String(ins.data.file_id), contentHash: String(ins.data.content_hash) };
}

/** The stored PDF of a sent invoice (the snapshot made at send time), or null when there is none. */
export async function readSnapshot(
  companyId: string,
  invoiceId: string,
): Promise<{ bytes: Uint8Array; name: string } | null> {
  const row = await getAdminSupabase()
    .from('invoice_snapshots')
    .select('file_id')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .eq('reason', 'sent')
    .is('deleted_at', null)
    .maybeSingle();
  if (row.error) throw new InternalError(row.error);
  if (!row.data) return null;
  const file = await getService('storage').get(String(row.data.file_id));
  if (file.record.companyId !== companyId) throw new NotFoundError();
  return { bytes: file.bytes, name: file.record.name };
}

/** Job: sent invoices without a snapshot get one (a failed render at send time is retried here). */
export async function backfillSnapshots(limit = 20): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('invoices')
    .select('id, company_id')
    .not('sent_at', 'is', null)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  let made = 0;
  for (const r of data ?? []) {
    if (made >= limit) break;
    const have = await admin
      .from('invoice_snapshots')
      .select('id')
      .eq('company_id', String(r.company_id))
      .eq('invoice_id', String(r.id))
      .eq('reason', 'sent')
      .limit(1);
    if (have.error || (have.data ?? []).length > 0) continue;
    try {
      await snapshotInvoice(String(r.company_id), String(r.id), 'sent');
      made += 1;
    } catch {
      continue;
    }
  }
  return made;
}
