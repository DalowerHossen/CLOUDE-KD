// path: app/api/email/track/open/[token]/route.ts
// Open pixel of an e-mail. A plain handler: the answer is an image, and mail clients send no session or CSRF token.
import { getAdminSupabase } from '@/lib/supabase/admin';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  if (/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
    // Tracking must never break the picture: a database problem is ignored.
    await getAdminSupabase()
      .rpc('kd_email_track', { p_token: token, p_kind: 'opened' })
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return new Response(PIXEL, {
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store, max-age=0',
      'content-length': String(PIXEL.length),
      'x-content-type-options': 'nosniff',
    },
  });
}
