// path: app/api/team/members/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  grantsSchema,
  listMembers,
  seatState,
  setStatus,
  statusSchema,
  updateGrants,
} from '@/services/team/members';

export const GET = withApi(
  {
    id: 'team.members.list',
    scope: 'tenant',
    permission: { action: 'team.read', resourceType: 'team' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [members, seats] = await Promise.all([
      listMembers(actor.companyId),
      seatState(actor.companyId),
    ]);
    return { data: { members, seats } };
  },
);

export const PUT = withApi(
  {
    id: 'team.members.permissions',
    scope: 'tenant',
    permission: { action: 'team.permissions', resourceType: 'team' },
    body: grantsSchema,
    auditExempt: 'The team service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await updateGrants(actor, body);
    return { data: { done: true } };
  },
);

export const PATCH = withApi(
  {
    id: 'team.members.status',
    scope: 'tenant',
    permission: { action: 'team.manage', resourceType: 'team' },
    body: statusSchema,
    auditExempt: 'The team service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await setStatus(actor, body);
    return { data: { done: true } };
  },
);
