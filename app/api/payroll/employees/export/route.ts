// path: app/api/payroll/employees/export/route.ts
// Plain handler: the employee directory as a CSV file, without pay, bank or tax details.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { exportEmployeesCsv } from '@/services/payroll/employees';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (
      !(await getService('permissions').can(actor, 'payroll.employee.manage', { type: 'employee' }))
    )
      throw new ForbiddenError();
    const csv = await exportEmployeesCsv(actor);
    return new Response(`${String.fromCharCode(0xfeff)}${csv}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="employees.csv"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
