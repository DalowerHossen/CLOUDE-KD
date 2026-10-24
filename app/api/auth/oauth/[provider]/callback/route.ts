// path: app/api/auth/oauth/[provider]/callback/route.ts
import { withApi } from '@/lib/api/with-api';
import { callbackSchema, completeOAuth, providerParamSchema } from '@/services/auth/oauth-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.oauth.callback',
    scope: 'public',
    networkContext: 'login',
    params: providerParamSchema,
    body: callbackSchema,
    auditExempt: 'The OAuth flow writes auth_login_events and the audit entries.',
  },
  async ({ params, body }) => ({
    data: await withMinDuration(() => completeOAuth(params.provider as 'google' | 'github', body)),
  }),
);
