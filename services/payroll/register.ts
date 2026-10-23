// path: services/payroll/register.ts
// Adds the payslip to the PDF contract: `pdf.render('payslip', { itemId })` for the signed-in company (the same encrypted file the
// pay run made, read through the storage contract is not needed: the PDF is drawn again from the stored figures).
import { z } from 'zod';
import { tryGetService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { registerPdfRenderer } from '@/lib/pdf/pdf-engine';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { registerOtpRecipientResolver } from '@/services/security/token-service';
import { renderPayslipPdf } from './runs';

export default async function register(): Promise<void> {
  // The one-time code of an employee link goes to the address on the employee record, never to an address from a request.
  registerOtpRecipientResolver('payslip', async (companyId, employeeId) => {
    const { data } = await getAdminSupabase()
      .from('employees')
      .select('email')
      .eq('company_id', companyId)
      .eq('id', employeeId)
      .is('deleted_at', null)
      .maybeSingle();
    return data?.email ? String(data.email) : null;
  });
  registerPdfRenderer('payslip', async (data) => {
    const parsed = z.object({ itemId: z.string().uuid() }).strict().safeParse(data);
    if (!parsed.success) throw new ValidationError('The payslip PDF needs a pay run item id.');
    const tenant = tryGetService('tenant');
    const ctx = tenant ? await tenant.getTenantContext().catch(() => null) : null;
    if (!ctx?.companyId) throw new ForbiddenError();
    return renderPayslipPdf(ctx.companyId, parsed.data.itemId);
  });
}
