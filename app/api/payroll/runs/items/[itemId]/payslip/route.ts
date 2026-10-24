// path: app/api/payroll/runs/items/[itemId]/payslip/route.ts
// Plain handler: sends the person to a short-lived signed link of an encrypted payslip of their own company (audited).
import { z } from 'zod';
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { payslipLink } from '@/services/payroll/runs';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { itemId } = await context.params;
    if (!z.string().uuid().safeParse(itemId).success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'payroll.run.read', { type: 'pay_run' })))
      throw new ForbiddenError();
    const url = await payslipLink(actor, itemId);
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'private, no-store' },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
