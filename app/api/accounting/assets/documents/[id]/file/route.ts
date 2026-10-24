// path: app/api/accounting/assets/documents/[id]/file/route.ts
// Plain handler: sends the person to a short-lived signed link of an asset document of their own company.
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
import { assetDocumentLink } from '@/services/asset/assets';

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
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'fixed_asset' })))
      throw new ForbiddenError();
    const url = await assetDocumentLink(actor.companyId, id);
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'private, no-store' },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
