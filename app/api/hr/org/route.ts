// path: app/api/hr/org/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listDepartments, listPositions, orgChart } from '@/services/hr/org';

export const GET = withApi(
  {
    id: 'hr.org.get',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'department' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [departments, positions, chart] = await Promise.all([
      listDepartments(actor.companyId),
      listPositions(actor.companyId),
      orgChart(actor.companyId),
    ]);
    return { data: { departments, positions, chart } };
  },
);
