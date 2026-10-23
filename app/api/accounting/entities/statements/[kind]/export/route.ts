// path: app/api/accounting/entities/statements/[kind]/export/route.ts
// Plain handler: a consolidated statement as a CSV, Excel or PDF file.
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { exportResponse } from '@/services/budget/export-response';
import { consolidated, consolidationTable } from '@/services/budget/entities';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await context.params;
  const k = z.enum(['profit_loss', 'balance_sheet']).safeParse(kind);
  if (!k.success)
    return errorResponse(
      normalizeError(new NotFoundError()),
      resolveCorrelationId(request.headers.get('x-correlation-id')),
    );
  return exportResponse(request, {
    permission: 'accounting.entity.manage',
    resourceType: 'entity_group',
    auditAction: 'entity.statement_exported',
    query: z.object({ format: z.string().optional(), from: dayText, to: dayText }).strip(),
    build: async (actor, q) => {
      const r = await consolidated(actor, k.data, q.from as string, q.to as string);
      return consolidationTable(k.data, q.from as string, q.to as string, r.result);
    },
  });
}
