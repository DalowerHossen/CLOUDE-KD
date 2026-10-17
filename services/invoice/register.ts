// path: services/invoice/register.ts
// Registers the `invoices` contract (the payment STEP applies payments and reads the amount due through it) and the
// invoice kind of the `pdf` contract.
import { z } from 'zod';
import { registerService, tryGetService } from '@/lib/container';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { registerPdfRenderer } from '@/lib/pdf/pdf-engine';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { InvoiceService, PdfService } from '@/types/contracts';
import { renderEstimatePdf } from '@/services/estimate/pdf';
import { applyPayment, getForPayment, markDisputed } from './payments';
import { renderInvoicePdf, snapshotInvoice } from './snapshots';

const renderInput = z
  .object({ invoiceId: z.string().uuid(), companyId: z.string().uuid().optional() })
  .strict();

async function companyOf(invoiceId: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('company_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !data) throw new NotFoundError();
  return String(data.company_id);
}

function createInvoiceContract(): InvoiceService {
  return {
    getForPayment,
    applyPayment,
    markDisputed,
    async snapshot(invoiceId) {
      const snap = await snapshotInvoice(await companyOf(invoiceId), invoiceId, 'sent');
      return { fileId: snap.fileId, contentHash: snap.contentHash };
    },
  };
}

registerPdfRenderer('invoice', async (data) => {
  const parsed = renderInput.safeParse(data);
  if (!parsed.success) throw new ValidationError('The invoice PDF needs an invoice id.');
  const companyId = await companyOf(parsed.data.invoiceId);
  const tenant = tryGetService('tenant');
  const ctx = tenant ? await tenant.getTenantContext().catch(() => null) : null;
  if (ctx && ctx.companyId !== companyId) throw new NotFoundError();
  return (await renderInvoicePdf(companyId, parsed.data.invoiceId)).bytes;
});

registerPdfRenderer('estimate', async (data) => {
  const parsed = z.object({ estimateId: z.string().uuid() }).strict().safeParse(data);
  if (!parsed.success) throw new ValidationError('The estimate PDF needs an estimate id.');
  const { data: row, error } = await getAdminSupabase()
    .from('estimates')
    .select('company_id')
    .eq('id', parsed.data.estimateId)
    .maybeSingle();
  if (error || !row) throw new NotFoundError();
  const companyId = String(row.company_id);
  const tenant = tryGetService('tenant');
  const ctx = tenant ? await tenant.getTenantContext().catch(() => null) : null;
  if (ctx && ctx.companyId !== companyId) throw new NotFoundError();
  return renderEstimatePdf(companyId, parsed.data.estimateId);
});

export default async function register(): Promise<void> {
  registerService('invoices', createInvoiceContract());
  const existing = tryGetService('pdf');
  if (!existing) {
    const { pdfRendererFor } = await import('@/lib/pdf/pdf-engine');
    const pdf: PdfService = {
      async render(kind, data) {
        const renderer = pdfRendererFor(kind);
        if (!renderer) throw new ValidationError('This kind of PDF is not available.');
        return renderer(data);
      },
    };
    registerService('pdf', pdf);
  }
}
