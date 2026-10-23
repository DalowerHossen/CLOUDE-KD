// path: app/api/team/invitations/accept/route.ts
import { withApi } from '@/lib/api/with-api';
import { acceptInvitation, acceptSchema } from '@/services/team/invitations';

export const POST = withApi(
  {
    id: 'team.invitations.accept',
    scope: 'public',
    rateLimitPolicy: 'strict',
    networkContext: 'signup',
    body: acceptSchema,
    auditExempt: 'The team service writes the audit entry.',
  },
  async ({ body, ip }) => {
    await acceptInvitation(body, ip);
    return { status: 201, data: { done: true } };
  },
);
