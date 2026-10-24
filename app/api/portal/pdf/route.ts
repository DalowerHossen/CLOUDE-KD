// path: app/api/portal/pdf/route.ts
// A plain handler: the answer is the PDF file. The link travels in the body, never in the address, so it does not end up
// in logs. An invoice, estimate or receipt link in good standing works; an invoice file is the stored snapshot of what was sent.
import { errorResponse, NotFoundError, normalizeError, ValidationError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { resolvePortalAccess } from '@/services/portal/access';
import { recordPortalEvent } from '@/services/portal/events';
import { getPortalPdf, PDF_DOC_TYPES } from '@/services/portal/pdf';
import { tokenOnlyBody } from '@/services/portal/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 512)
      throw new ValidationError('The request is too large.');
    const parsed = tokenOnlyBody.safeParse(JSON.parse(text) as unknown);
    if (!parsed.success) throw new ValidationError('Invalid request.');
    const access = await resolvePortalAccess(parsed.data.token, PDF_DOC_TYPES);
    if (access.state !== 'ok') throw new NotFoundError();
    const file = await getPortalPdf(access, parsed.data.token);
    await recordPortalEvent(access, 'pdf_download');
    const name = file.name.replace(/[^A-Za-z0-9._-]/g, '_') || 'document.pdf';
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(file.bytes.length),
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(
      normalizeError(
        thrown instanceof SyntaxError ? new ValidationError('Invalid request.') : thrown,
      ),
      correlationId,
    );
  }
}
