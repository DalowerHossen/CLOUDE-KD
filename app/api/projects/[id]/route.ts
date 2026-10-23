// path: app/api/projects/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { projectUpdateSchema } from '@/lib/project/input';
import {
  getProject,
  listMilestones,
  listProjectMembers,
  projectUsage,
  trashProject,
  updateProject,
} from '@/services/project/projects';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'projects.get',
    scope: 'tenant',
    permission: { action: 'project.read', resourceType: 'project' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const project = await getProject(actor.companyId, p.id);
    const [members, milestones, usage] = await Promise.all([
      listProjectMembers(actor.companyId, p.id),
      listMilestones(actor.companyId, p.id),
      projectUsage(actor.companyId, project),
    ]);
    return { data: { project, members, milestones, usage } };
  },
);

export const PUT = withApi(
  {
    id: 'projects.update',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    body: projectUpdateSchema,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateProject(actor, p.id, body.expectedVersion, body.project) };
  },
);

export const DELETE = withApi(
  {
    id: 'projects.delete',
    scope: 'tenant',
    permission: { action: 'project.manage', resourceType: 'project' },
    params,
    auditExempt: 'The project service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await trashProject(actor, p.id);
    return { data: { id: p.id } };
  },
);
