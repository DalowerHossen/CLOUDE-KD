// path: app/api/social/connect/facebook/callback/route.ts
// A plain handler: Facebook sends the owner back here with a code (or an error when the owner said no). The state ties the answer
// to the owner who started the login; it works once.
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ForbiddenError, UnauthorizedError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { assertApiModuleEnabled } from '@/services/company/module-access';
import { finishFacebookLogin } from '@/services/social/meta-connect';

export const runtime = 'nodejs';

const query = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_\-.~%]{10,1000}$/)
    .optional(),
  state: z
    .string()
    .regex(/^[A-Za-z0-9]{40}$/)
    .optional(),
  error: z.string().max(100).optional(),
});

const back = (path: string): Response =>
  new Response(null, { status: 302, headers: { location: path, 'cache-control': 'no-store' } });

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new ForbiddenError();
    if (!(await getService('permissions').can(actor, 'social.manage', { type: 'social_account' })))
      throw new ForbiddenError();
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return back('/social?connect=failed');
    // The owner said no (or Facebook refused): nothing to do but tell the owner.
    if (parsed.data.error || !parsed.data.code || !parsed.data.state)
      return back('/social?connect=cancelled');
    try {
      const id = await finishFacebookLogin(actor, {
        code: parsed.data.code,
        state: parsed.data.state,
      });
      return back(`/social/connect?s=${encodeURIComponent(id)}`);
    } catch {
      return back('/social?connect=failed');
    }
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
