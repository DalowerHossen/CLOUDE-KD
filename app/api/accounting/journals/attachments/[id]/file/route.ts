// path: app/api/accounting/journals/attachments/[id]/file/route.ts
// A plain handler: sends the person to a short-lived signed link of the file of a journal entry (their own company only).
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
import { attachmentLink } from '@/services/accounting/attachments';
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
    if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'journal_entry' })))
      throw new ForbiddenError();
    const url = await attachmentLink(actor.companyId, id);
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'private, no-store' },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
