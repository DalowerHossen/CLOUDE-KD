// path: app/api/pdf/estimates/[id]/route.ts
// A plain handler: the answer is the PDF file of an estimate of the signed-in company.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { getEstimate } from '@/services/estimate/estimates';
import { renderEstimatePdf } from '@/services/estimate/pdf';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'estimate.read', { type: 'estimate', id })))
      throw new ForbiddenError();
    const estimate = await getEstimate(actor.companyId, id, { includeTrashed: true });
    const bytes = await renderEstimatePdf(actor.companyId, id);
    const name = `${(estimate.number ?? 'draft').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(bytes.length),
        'content-disposition': `inline; filename="${name}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
