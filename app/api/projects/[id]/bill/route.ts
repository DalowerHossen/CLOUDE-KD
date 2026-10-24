// path: app/api/projects/[id]/bill/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { billInputSchema } from '@/lib/project/input';
import { createProjectInvoice, unbilledForProject } from '@/services/project/billing';

const params = z.object({ id: z.string().uuid() }).strict();

/** What can be billed now: approved time, done milestones, reimbursable expenses. */
export const GET = withApi(
  {
    id: 'projects.unbilled',
    scope: 'tenant',
    permission: { action: 'project.bill', resourceType: 'project' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await unbilledForProject(actor, p.id) };
  },
);

/** Makes a draft invoice from the chosen work. */
export const POST = withApi(
  {
    id: 'projects.bill',
    scope: 'tenant',
    permission: { action: 'project.bill', resourceType: 'project' },
    params,
    body: billInputSchema,
    idempotent: true,
    maxBodyBytes: 1_000_000,
    auditExempt: 'The project billing service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createProjectInvoice(actor, p.id, body) };
  },
);
