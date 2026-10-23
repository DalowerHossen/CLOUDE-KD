// path: app/api/admin/emails/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { settingsView } from '@/services/email/settings';

export const GET = withApi(
  {
    id: 'admin.email.settings.read',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'email.platform.manage', resourceType: 'email' },
  },
  async () => ({ data: await settingsView(null) }),
);
