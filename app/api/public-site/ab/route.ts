// path: app/api/public-site/ab/route.ts
// Experiments of the public site: the browser reads a running experiment and reports exposures and conversions.
// Only visitors who allowed analytics cookies are counted (checked here from the consent cookie).
import { cookies } from 'next/headers';
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { CONSENT_COOKIE, parseConsent } from '@/lib/analytics/consent';
import { NotFoundError } from '@/lib/errors';
import { countAb, publicExperiment } from '@/services/marketing/admin';
import { abEventSchema } from '@/services/marketing/schemas';

export const GET = withApi(
  {
    id: 'public.ab.get',
    scope: 'public',
    query: z.object({ key: z.string().regex(/^[a-z0-9-]{3,40}$/) }).strict(),
  },
  async ({ query }) => {
    const experiment = await publicExperiment(query.key);
    if (!experiment) throw new NotFoundError();
    return { data: experiment };
  },
);

export const POST = withApi(
  {
    id: 'public.ab.count',
    scope: 'public',
    body: abEventSchema,
    auditExempt: 'Only an anonymous counter changes; no personal data is stored.',
  },
  async ({ body }) => {
    const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
    if (!consent?.analytics) return { status: 202, data: { counted: false } };
    return { status: 202, data: { counted: await countAb(body.key, body.variant, body.kind) } };
  },
);
