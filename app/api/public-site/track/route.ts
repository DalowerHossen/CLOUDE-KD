// path: app/api/public-site/track/route.ts
// Server-side copy of a conversion for Meta (conversions API). Works only when the visitor allowed marketing cookies
// (checked here from the consent cookie) and the owner set an access token. The same event id as the browser pixel
// lets Meta count the event once.
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { CONSENT_COOKIE, parseConsent } from '@/lib/analytics/consent';
import { sendMetaEvent } from '@/services/analytics/pixels';

export const POST = withApi(
  {
    id: 'public.track',
    scope: 'public',
    body: z
      .object({
        event: z.enum(['Lead', 'CompleteRegistration']),
        eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
        path: z.string().regex(/^\/[a-z0-9/._-]{0,120}$/),
      })
      .strict(),
    auditExempt: 'No data of ours changes; the event is forwarded only with marketing consent.',
  },
  async ({ body }) => {
    const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
    if (!consent?.marketing) return { status: 202, data: { sent: false } };
    const h = await headers();
    const origin = h.get('origin') ?? '';
    const sent = await sendMetaEvent({
      event: body.event,
      eventId: body.eventId,
      url: `${origin}${body.path}`,
      userAgent: h.get('user-agent'),
    });
    return { status: 202, data: { sent } };
  },
);
