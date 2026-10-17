// path: app/api/pdf/credit-notes/[id]/route.ts
// A plain handler: the answer is the PDF file of a credit note of the signed-in company.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { getCreditNote } from '@/services/credit/credit-notes';
import { renderCreditNotePdf } from '@/services/credit/pdf';

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
    if (!(await getService('permissions').can(actor, 'credit.read', { type: 'credit_note', id })))
      throw new ForbiddenError();
    const credit = await getCreditNote(actor.companyId, id);
    const bytes = await renderCreditNotePdf(actor.companyId, id);
    const name = `${(credit.number ?? 'draft').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
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
