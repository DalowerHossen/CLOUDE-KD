// path: app/api/projects/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { plain } from '@/lib/crm/clients';
import { PROJECT_STATUSES, projectInputSchema } from '@/lib/project/input';
import { createProject, listProjects } from '@/services/project/projects';

export const GET = withApi(
  {
    id: 'projects.list',
    scope: 'tenant',
    permission: { action: 'project.read', resourceType: 'project' },
    query: z
      .object({
        status: z.enum(PROJECT_STATUSES).optional(),
        clientId: z.string().uuid().optional(),
        q: plain(0, 80).optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listProjects(actor.companyId, { ...query, limit: 200 }) };
  },
);

export const POST = withApi(
  {
    id: 'projects.create',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    body: projectInputSchema,
    idempotent: true,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createProject(actor, body) };
  },
);
