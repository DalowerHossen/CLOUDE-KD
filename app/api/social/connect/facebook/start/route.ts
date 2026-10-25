// path: app/api/social/connect/facebook/start/route.ts
// A plain handler: sends the owner to the Facebook login of the platform's Meta app.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { assertApiModuleEnabled } from '@/services/company/module-access';
import { startFacebookLogin } from '@/services/social/meta-connect';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new ForbiddenError();
    if (!(await getService('permissions').can(actor, 'social.manage', { type: 'social_account' })))
      throw new ForbiddenError();
    const limit = await getService('security').rateLimit(
      `social-connect:${actor.userId}`,
      'strict',
    );
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    const target = await startFacebookLogin(actor);
    return new Response(null, {
      status: 302,
      headers: { location: target, 'cache-control': 'no-store' },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
