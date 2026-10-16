// path: app/api/email/unsubscribe/[token]/route.ts
// One-click unsubscribe (RFC 8058): the mail client sends POST; a person who opens the link sees a short page.
import { getAdminSupabase } from '@/lib/supabase/admin';

const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;

async function unsubscribe(token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const { data, error } = await getAdminSupabase().rpc('kd_email_unsubscribe', { p_token: token });
  return !error && data === true;
}

const page = (message: string): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">KD SOLUTION IT</h1><p>${message}</p></body></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const ok = await unsubscribe((await context.params).token);
  return ok ? new Response(null, { status: 200 }) : new Response(null, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const ok = await unsubscribe((await context.params).token);
  return page(
    ok ? 'You will not receive these e-mails any more.' : 'This link is not valid any more.',
  );
}
