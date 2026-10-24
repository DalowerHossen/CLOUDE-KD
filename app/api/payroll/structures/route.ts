// path: app/api/payroll/structures/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { structureInput } from '@/services/payroll/payroll-rules';
import {
  createStructure,
  listComponents,
  listGrades,
  listStructures,
} from '@/services/payroll/structures';

export const GET = withApi(
  {
    id: 'payroll.structures.list',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_structure' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [grades, components, structures] = await Promise.all([
      listGrades(actor.companyId),
      listComponents(actor.companyId),
      listStructures(actor.companyId),
    ]);
    return { data: { grades, components, structures } };
  },
);

export const POST = withApi(
  {
    id: 'payroll.structures.create',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_structure' },
    body: structureInput,
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createStructure(actor, body) };
  },
);
