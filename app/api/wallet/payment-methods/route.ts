// path: app/api/wallet/payment-methods/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  companyChoiceInput,
  listForCompany,
  saveCompanyChoice,
} from '@/services/payout/payment-methods';

export const GET = withApi(
  {
    id: 'wallet.payment-methods.list',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payment_method' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listForCompany(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'wallet.payment-methods.save',
    scope: 'tenant',
    permission: { action: 'payment.methods.manage', resourceType: 'payment_method' },
    body: companyChoiceInput,
    auditExempt: 'The payment method service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveCompanyChoice(actor, body) };
  },
);
