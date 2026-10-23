// path: app/api/storage/drive/callback/route.ts
// Google sends the browser back here. A plain handler because the answer is a redirect to the settings page.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getService } from '@/lib/container';
import { AppError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { finishDriveLink } from '@/services/storage/drive-link';

const SAFE = /^[A-Za-z0-9._~\-/+=]{1,2048}$/;

export async function GET(request: NextRequest): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  const target = new URL('/settings/storage', getPublicEnv().NEXT_PUBLIC_APP_URL);
  return runWithContext({ correlationId }, async () => {
    try {
      const actor = await getService('auth').getActor();
      if (!actor) return NextResponse.redirect(new URL('/login', target));
      updateContext({ actorId: actor.userId, companyId: actor.companyId });
      const allowed = await getService('permissions').can(actor, 'storage.manage', {
        type: 'storage',
      });
      if (!allowed) return NextResponse.redirect(new URL('/', target));
      const code = request.nextUrl.searchParams.get('code') ?? '';
      const state = request.nextUrl.searchParams.get('state') ?? '';
      if (request.nextUrl.searchParams.get('error') || !SAFE.test(code) || !SAFE.test(state)) {
        target.searchParams.set('drive', 'cancelled');
        return NextResponse.redirect(target);
      }
      await finishDriveLink(actor, code, state);
      target.searchParams.set('drive', 'connected');
    } catch (error) {
      target.searchParams.set(
        'drive',
        error instanceof AppError && error.expose ? 'failed' : 'error',
      );
    }
    return NextResponse.redirect(target);
  });
}
