// path: app/api/projects/[id]/milestones/[mid]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { milestoneInputSchema } from '@/lib/project/input';
import { removeMilestone, saveMilestone } from '@/services/project/projects';

const params = z.object({ id: z.string().uuid(), mid: z.string().uuid() }).strict();

export const PUT = withApi(
  {
    id: 'projects.saveMilestone',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    body: milestoneInputSchema,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveMilestone(actor, p.id, p.mid, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'projects.removeMilestone',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await removeMilestone(actor, p.id, p.mid) };
  },
);
