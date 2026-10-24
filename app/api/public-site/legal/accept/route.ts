// path: app/api/public-site/legal/accept/route.ts
import { withApi } from '@/lib/api/with-api';
import { acceptSchema, acceptanceSubject, recordAcceptance } from '@/services/cms/legal';

export const POST = withApi(
  {
    id: 'public.legal.accept',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: acceptSchema,
    auditExempt:
      'The acceptance log is its own evidence trail; the service also writes an audit entry.',
  },
  async ({ body }) => {
    const subject = await acceptanceSubject();
    const version = await recordAcceptance(subject, body.slug);
    return { data: { slug: version.slug, version: version.version } };
  },
);
