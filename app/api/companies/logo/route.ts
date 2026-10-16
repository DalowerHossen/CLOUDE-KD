// path: app/api/companies/logo/route.ts
// POST stores a new logo (JSON, base64). GET answers the bytes of the signed-in company's logo; it is a plain handler
// because the answer is an image, and it reads only the logo of the session's own company.
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { logoUploadSchema, readLogo, uploadLogo } from '@/services/company/logo';

export const POST = withApi(
  {
    id: 'company.logo.upload',
    scope: 'tenant',
    permission: { action: 'company.manage', resourceType: 'company' },
    rateLimitPolicy: 'upload',
    maxBodyBytes: 2_200_000,
    body: logoUploadSchema,
    auditExempt: 'The storage service and the settings service write the audit entries.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await uploadLogo(actor, body) };
  },
);

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    const logo = await readLogo(actor.companyId);
    return new Response(Buffer.from(logo.bytes), {
      headers: {
        'content-type': logo.mimeType,
        'content-length': String(logo.bytes.length),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
