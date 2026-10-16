// path: app/api/companies/admin/staff/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { staffActionSchema } from '@/lib/company/ops-input';
import { listStaff, runStaffAction } from '@/services/team/admin-staff';

export const GET = withApi(
  {
    id: 'admin.staff.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'staff.read', resourceType: 'staff' },
  },
  async () => ({ data: await listStaff() }),
);

export const POST = withApi(
  {
    id: 'admin.staff.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'staff.manage', resourceType: 'staff' },
    stepUp: { maxAgeSeconds: 300 },
    body: staffActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runStaffAction(actor, body) };
  },
);
