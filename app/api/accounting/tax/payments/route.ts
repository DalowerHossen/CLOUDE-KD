// path: app/api/accounting/tax/payments/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { addPayment, listPayments } from '@/services/taxfiling/filing';
import { paymentInput } from '@/services/taxfiling/tax-rules';

export const GET = withApi(
  {
    id: 'accounting.tax.payments',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'tax_filing' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPayments(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.tax.payment_add',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    body: paymentInput,
    idempotent: true,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addPayment(actor, body) };
  },
);
