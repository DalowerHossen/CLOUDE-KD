// path: app/api/integrations/settlement/statement/route.ts
// The statement of one sub-merchant as a CSV file. A plain handler because the answer is the file itself.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { PLATFORM_ROLES } from '@/types/contracts';
import { statementOf } from '@/services/gateway/balances';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (PLATFORM_ROLES.includes(actor.role) || !actor.companyId) throw new NotFoundError();
    if (
      !(await getService('permissions').can(actor, 'settlement.read', {
        type: 'settlement_entry',
      }))
    )
      throw new ForbiddenError();
    const limit = await getService('security').rateLimit(
      `settlement-csv:${actor.userId}`,
      'export',
    );
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    const sub = new URL(request.url).searchParams.get('subMerchantId') ?? '';
    if (!UUID.test(sub)) throw new ValidationError('A sub-merchant is needed.');
    const csv = await statementOf(actor, sub);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="settlement-statement.csv"',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
