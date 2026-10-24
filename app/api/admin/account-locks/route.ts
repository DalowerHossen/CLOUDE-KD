// path: app/api/admin/account-locks/route.ts
import { withApi } from '@/lib/api/with-api';
import { listLockedAccounts } from '@/services/auth/unlock-flow';

export const GET = withApi(
  {
    id: 'admin.account_locks.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'auth.account.read', resourceType: 'account_lock' },
  },
  async () => ({ data: { items: await listLockedAccounts() } }),
);
