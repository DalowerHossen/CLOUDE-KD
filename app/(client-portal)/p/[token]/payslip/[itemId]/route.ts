// path: app/(client-portal)/p/[token]/payslip/[itemId]/route.ts
// Plain handler: sends the employee to a short-lived signed link of one of their own payslips. The link, the code and the rate
// limits are checked each time; every other case, including a payslip of someone else, gets the same plain "not found".
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { resolvePortalAccess } from '@/services/portal/access';
import { portalPayslipLink } from '@/services/payroll/portal';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; itemId: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { token, itemId } = await context.params;
    if (!z.string().uuid().safeParse(itemId).success) throw new NotFoundError();
    const access = await resolvePortalAccess(token, ['payslip']);
    if (access.state !== 'ok') throw new NotFoundError();
    const url = await portalPayslipLink(access, itemId);
    return new Response(null, {
      status: 302,
      headers: {
        location: url,
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
