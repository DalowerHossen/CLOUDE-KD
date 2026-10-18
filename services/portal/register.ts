// path: services/portal/register.ts
// Adds the receipt to the PDF contract: `pdf.render('receipt', { paymentId })` for the signed-in company.
import { z } from 'zod';
import { tryGetService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { registerPdfRenderer } from '@/lib/pdf/pdf-engine';
import { renderReceiptPdf } from './receipt-view';

export default async function register(): Promise<void> {
  registerPdfRenderer('receipt', async (data) => {
    const parsed = z.object({ paymentId: z.string().uuid() }).strict().safeParse(data);
    if (!parsed.success) throw new ValidationError('The receipt PDF needs a payment id.');
    const tenant = tryGetService('tenant');
    const ctx = tenant ? await tenant.getTenantContext().catch(() => null) : null;
    if (!ctx?.companyId) throw new ForbiddenError();
    return (await renderReceiptPdf(ctx.companyId, parsed.data.paymentId)).bytes;
  });
}
