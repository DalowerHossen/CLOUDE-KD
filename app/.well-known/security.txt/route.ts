// path: app/.well-known/security.txt/route.ts
// security.txt (RFC 9116): where to report a vulnerability. A plain handler because the answer is text.
import { absoluteUrl } from '@/lib/cms/site-url';
import { readSeoSettings } from '@/services/seo/settings';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const settings = await readSeoSettings();
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const lines = [
    ...(settings.organization.contactEmail
      ? [`Contact: mailto:${settings.organization.contactEmail}`]
      : []),
    `Contact: ${absoluteUrl('/contact')}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${absoluteUrl('/.well-known/security.txt')}`,
    `Policy: ${absoluteUrl('/legal/responsible-disclosure')}`,
  ];
  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
