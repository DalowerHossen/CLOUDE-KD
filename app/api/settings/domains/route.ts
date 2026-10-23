// path: app/api/settings/domains/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  actionSchema,
  addDomain,
  addSchema,
  checkDomain,
  listDomains,
  makePrimary,
  removeDomain,
  removeSchema,
} from '@/services/domain/domains';

const permission = { action: 'domain.manage', resourceType: 'domain' } as const;

export const GET = withApi(
  { id: 'domains.list', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDomains(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'domains.add',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'strict',
    body: addSchema,
    auditExempt: 'The domain service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await addDomain(actor, body) };
  },
);

export const PUT = withApi(
  {
    id: 'domains.action',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'strict',
    body: actionSchema,
    auditExempt: 'The domain service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (body.action === 'primary') {
      await makePrimary(actor, body.id);
      return { data: { done: true } };
    }
    await checkDomain(actor.companyId, body.id, actor);
    return { data: { done: true } };
  },
);

export const DELETE = withApi(
  {
    id: 'domains.remove',
    scope: 'tenant',
    permission,
    query: removeSchema,
    auditExempt: 'The domain service writes the audit entry.',
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    await removeDomain(actor, query.id);
    return { data: { done: true } };
  },
);
