// path: app/api/admin/siem/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { requireActor, runSiemAction, siemActionSchema } from '@/services/siem/siem-service';

export const POST = withApi(
  {
    id: 'admin.siem.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'siem.manage', resourceType: 'siem' },
    stepUp: { maxAgeSeconds: 300 },
    body: siemActionSchema,
    auditExempt: 'The SIEM service writes the audit entry.',
  },
  async ({ body, actor }) => {
    await runSiemAction(requireActor(actor), body);
    return { data: { done: true } };
  },
);
