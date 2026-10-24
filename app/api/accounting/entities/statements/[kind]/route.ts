// path: app/api/accounting/entities/statements/[kind]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { consolidated } from '@/services/budget/entities';

export const GET = withApi(
  {
    id: 'accounting.entities.statement',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
    params: z.object({ kind: z.enum(['profit_loss', 'balance_sheet']) }).strict(),
    query: z.strictObject({ from: dayText, to: dayText }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: (await consolidated(actor, params.kind, query.from, query.to)).result };
  },
);
