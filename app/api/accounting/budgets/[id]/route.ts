// path: app/api/accounting/budgets/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { budgetUpdate } from '@/services/budget/budget-rules';
import { deleteDraft, getBudget, updateBudget } from '@/services/budget/budgets';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.budgets.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'budget' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getBudget(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'accounting.budgets.update',
    scope: 'tenant',
    permission: { action: 'accounting.budget.edit', resourceType: 'budget' },
    params,
    body: budgetUpdate,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateBudget(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.budgets.delete',
    scope: 'tenant',
    permission: { action: 'accounting.budget.edit', resourceType: 'budget' },
    params,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteDraft(actor, p.id);
    return { data: { ok: true } };
  },
);
