// path: app/api/projects/[id]/milestones/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { milestoneInputSchema } from '@/lib/project/input';
import { saveMilestone } from '@/services/project/projects';

export const POST = withApi(
  {
    id: 'projects.addMilestone',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: milestoneInputSchema,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await saveMilestone(actor, p.id, null, body) };
  },
);
