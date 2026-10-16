// path: app/api/team/invitations/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  createInvitation,
  invitationActionSchema,
  inviteSchema,
  listInvitations,
  runInvitationAction,
} from '@/services/team/invitations';

const permission = { action: 'team.manage', resourceType: 'team' } as const;

export const GET = withApi(
  { id: 'team.invitations.list', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listInvitations(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'team.invitations.create',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'strict',
    body: inviteSchema,
    auditExempt: 'The team service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createInvitation(actor, body) };
  },
);

export const PUT = withApi(
  {
    id: 'team.invitations.action',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'strict',
    body: invitationActionSchema,
    auditExempt: 'The team service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runInvitationAction(actor, body);
    return { data: { done: true } };
  },
);
