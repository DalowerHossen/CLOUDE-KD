// path: app/api/projects/[id]/members/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { memberInputSchema } from '@/lib/project/input';
import { removeMember, saveMember } from '@/services/project/projects';

const params = z.object({ id: z.string().uuid() }).strict();

/** Adds a person to the project, or changes their role and rate. */
export const PUT = withApi(
  {
    id: 'projects.saveMember',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    body: memberInputSchema,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveMember(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'projects.removeMember',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    body: z.object({ userId: z.string().uuid() }).strict(),
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await removeMember(actor, p.id, body.userId) };
  },
);
