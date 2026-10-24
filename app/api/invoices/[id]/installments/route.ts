// path: app/api/invoices/[id]/installments/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { installmentPlanSchema } from '@/lib/schedule/input';
import {
  listInstallments,
  previewPlan,
  removePlan,
  savePlan,
} from '@/services/invoice/installments';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'invoices.installments',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listInstallments(actor.companyId, p.id) };
  },
);

/** Preview (dry run) of a plan: the parts and any problems, nothing is saved. */
export const PATCH = withApi(
  {
    id: 'invoices.installmentsPreview',
    scope: 'tenant',
    permission: { action: 'installment.manage', resourceType: 'invoice' },
    params,
    body: installmentPlanSchema,
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await previewPlan(actor.companyId, p.id, body) };
  },
);

export const PUT = withApi(
  {
    id: 'invoices.installmentsSave',
    scope: 'tenant',
    permission: { action: 'installment.manage', resourceType: 'invoice' },
    params,
    body: installmentPlanSchema,
    auditExempt: 'The installment service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await savePlan(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'invoices.installmentsRemove',
    scope: 'tenant',
    permission: { action: 'installment.manage', resourceType: 'invoice' },
    params,
    auditExempt: 'The installment service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await removePlan(actor, p.id);
    return { data: { id: p.id } };
  },
);
