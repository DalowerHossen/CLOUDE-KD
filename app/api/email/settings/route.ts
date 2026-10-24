// path: app/api/email/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { settingsView } from '@/services/email/settings';

export const GET = withApi(
  {
    id: 'email.settings.read',
    scope: 'tenant',
    permission: { action: 'email.settings.manage', resourceType: 'email' },
  },
  async ({ tenant }) => {
    if (!tenant) throw new Error('unreachable');
    return { data: await settingsView(tenant.companyId) };
  },
);
