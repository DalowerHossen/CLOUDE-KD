// path: app/api/auth/oauth/[provider]/start/route.ts
import { withApi } from '@/lib/api/with-api';
import { providerParamSchema, startOAuth, startSchema } from '@/services/auth/oauth-flow';

export const POST = withApi(
  {
    id: 'auth.oauth.start',
    scope: 'public',
    networkContext: 'login',
    params: providerParamSchema,
    body: startSchema,
    auditExempt: 'Starting the redirect changes nothing durable.',
  },
  async ({ params, body }) => ({
    data: await startOAuth(params.provider as 'google' | 'github', body.mode),
  }),
);
