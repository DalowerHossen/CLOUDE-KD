// path: app/api/email/track/click/[token]/[index]/route.ts
// Click tracking. The target address is read from the stored message, never from the request, so this cannot be
// used as an open redirect.
import { z } from 'zod';
import { getAdminSupabase } from '@/lib/supabase/admin';

const params = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/),
  index: z.coerce.number().int().min(0).max(999),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; index: string }> },
): Promise<Response> {
  const parsed = params.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const { data } = await getAdminSupabase()
    .from('email_outbox')
    .select('links, track')
    .eq('tracking_token', parsed.data.token)
    .is('deleted_at', null)
    .maybeSingle();
  const links = Array.isArray(data?.links) ? (data.links as unknown[]) : [];
  const target = links[parsed.data.index];
  if (!data || data.track !== true || typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    return new Response(null, { status: 404 });
  }
  await getAdminSupabase()
    .rpc('kd_email_track', { p_token: parsed.data.token, p_kind: 'clicked' })
    .then(
      () => undefined,
      () => undefined,
    );
  void request;
  return new Response(null, {
    status: 302,
    headers: { location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}
