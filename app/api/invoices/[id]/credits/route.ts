// path: app/api/invoices/[id]/credits/route.ts
// What reduced an invoice (credits and deposits applied), what could still be applied to it, and applying one.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { creditApplySchema } from '@/lib/credit/input';
import { applyCredit, availableCredits, listApplications } from '@/services/credit/credit-notes';

export const GET = withApi(
  {
    id: 'invoices.credits',
    scope: 'tenant',
    permission: { action: 'credit.read', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [applied, available] = await Promise.all([
      listApplications(actor.companyId, { invoiceId: p.id }),
      availableCredits(actor.companyId, p.id),
    ]);
    return { data: { applied, available } };
  },
);

/** Applies a credit note or a paid deposit to this invoice. */
export const POST = withApi(
  {
    id: 'invoices.applyCredit',
    scope: 'tenant',
    permission: { action: 'credit.apply', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: creditApplySchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    if (body.invoiceId !== p.id) throw new ForbiddenError();
    return { data: await applyCredit(actor, body) };
  },
);
