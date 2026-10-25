// path: app/api/payroll/runs/[id]/payment-file/route.ts
// Plain handler: the bank transfer list of an approved pay run as a CSV file. Needs the pay permission and a fresh identity check.
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
import { paymentFile } from '@/services/payroll/runs';
import { assertApiModuleEnabled } from '@/services/company/module-access';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    const permissions = getService('permissions');
    if (
      !(await permissions.can(actor, 'payroll.run.pay', { type: 'pay_run' })) ||
      !(await permissions.can(actor, 'payroll.pay.read', { type: 'employee' }))
    )
      throw new ForbiddenError();
    await getService('auth').requireStepUp(actor, { maxAgeSeconds: 600 });
    const file = await paymentFile(actor, id);
    return new Response(`${String.fromCharCode(0xfeff)}${file.csv}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="transfers.csv"',
        'x-transfer-total': file.total,
        'x-transfer-missing': String(file.missing.length),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
