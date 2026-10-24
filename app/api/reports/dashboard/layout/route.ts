// path: app/api/reports/dashboard/layout/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { WIDGET_IDS, layoutSchema } from '@/lib/reports/widgets';
import { getLayout, saveLayout } from '@/services/report/dashboard';

export const GET = withApi(
  {
    id: 'reports.layout',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'dashboard_layout' },
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await getLayout(actor, new Set(WIDGET_IDS)) };
  },
);

export const PUT = withApi(
  {
    id: 'reports.saveLayout',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'dashboard_layout' },
    body: layoutSchema,
    auditExempt: 'A dashboard layout is a personal preference, not business data.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveLayout(actor, body.widgets) };
  },
);
