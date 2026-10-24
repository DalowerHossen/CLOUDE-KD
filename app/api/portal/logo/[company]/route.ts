// path: app/api/portal/logo/[company]/route.ts
// The logo of a company for its clients' pages and messages. A logo is meant to be seen, so no link is needed; the answer
// is only the image, only for a company that has one, limited per address.
import { getService } from '@/lib/container';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { readRequestMeta } from '@/services/audit/request-meta';
import { readLogo } from '@/services/company/logo';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ company: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { company } = await context.params;
    if (!UUID.test(company)) throw new NotFoundError();
    const meta = await readRequestMeta();
    const limited = await getService('security').rateLimit(
      `portal:logo:${meta.ipHash ?? 'unknown'}`,
      'download',
    );
    if (!limited.allowed) throw new NotFoundError();
    const logo = await readLogo(company.toLowerCase());
    return new Response(Buffer.from(logo.bytes), {
      headers: {
        'content-type': logo.mimeType,
        'content-length': String(logo.bytes.length),
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
