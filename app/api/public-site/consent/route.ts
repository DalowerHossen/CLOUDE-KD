// path: app/api/public-site/consent/route.ts
// Records the cookie choice of a visitor as evidence. The choice itself lives in the kd_consent cookie that the
// browser sets; this route stores who chose what (by a random visitor id, never by name or address).
import { cookies } from 'next/headers';
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { CONSENT_TEXT, COOKIE_POLICY_VERSION, VISITOR_COOKIE } from '@/lib/analytics/consent';
import { getService } from '@/lib/container';
import { cookieSecure } from '@/lib/auth/session';
import { randomHex } from '@/lib/utils/hash';

const body = z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict();

export const POST = withApi(
  {
    id: 'public.consent',
    scope: 'public',
    body,
    auditExempt: 'Consent records are their own evidence trail (consent_records_platform).',
  },
  async ({ body: choice }) => {
    const jar = await cookies();
    let visitor = jar.get(VISITOR_COOKIE)?.value ?? '';
    if (!/^[0-9a-f]{32}$/.test(visitor)) {
      visitor = randomHex(16);
      jar.set(VISITOR_COOKIE, visitor, {
        httpOnly: true,
        secure: cookieSecure(),
        sameSite: 'lax',
        path: '/',
        maxAge: 400 * 24 * 3600,
      });
    }
    const consent = getService('consent');
    const subject = `visitor:${visitor}`;
    for (const [purpose, granted] of [
      ['analytics', choice.analytics],
      ['marketing', choice.marketing],
    ] as const) {
      if (granted)
        await consent.record({
          subject,
          purpose,
          version: COOKIE_POLICY_VERSION,
          text: CONSENT_TEXT,
        });
      else await consent.withdraw(subject, purpose);
    }
    return { data: { recorded: true } };
  },
);
