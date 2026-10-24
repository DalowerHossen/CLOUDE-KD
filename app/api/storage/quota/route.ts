// path: app/api/storage/quota/route.ts
import { withApi } from '@/lib/api/with-api';
import { quotaState } from '@/services/storage/quota';

export const GET = withApi({ id: 'storage.quota', scope: 'tenant' }, async ({ tenant }) => {
  if (!tenant) throw new Error('unreachable');
  return { data: await quotaState(tenant.companyId) };
});
