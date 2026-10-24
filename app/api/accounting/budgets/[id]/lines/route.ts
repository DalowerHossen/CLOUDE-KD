// path: app/api/accounting/budgets/[id]/lines/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { lineInput } from '@/services/budget/budget-rules';
import { cellsOf, setLine } from '@/services/budget/budgets';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.budgets.lines',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'budget' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cellsOf(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.budgets.line_set',
    scope: 'tenant',
    permission: { action: 'accounting.budget.edit', resourceType: 'budget' },
    params,
    body: lineInput,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await setLine(actor, p.id, body);
    return { data: { ok: true } };
  },
);
