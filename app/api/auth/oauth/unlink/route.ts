// path: app/api/auth/oauth/unlink/route.ts
import { withApi } from '@/lib/api/with-api';
import { unlinkProvider, unlinkSchema } from '@/services/auth/oauth-flow';
import type { OAuthProvider } from '@/lib/auth/oauth';

export const POST = withApi(
  {
    id: 'auth.oauth.unlink',
    scope: 'public',
    body: unlinkSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body }) => {
    await unlinkProvider(body.provider as OAuthProvider);
    return { data: { unlinked: true } };
  },
);
