// path: app/api/public-site/notices/route.ts
import { withApi } from '@/lib/api/with-api';
import { listPublic } from '@/services/company/announcements';

/** The notices every visitor may see (planned maintenance, warnings) while they are live. */
export const GET = withApi({ id: 'public.notices', scope: 'public' }, async () => ({
  data: await listPublic(),
  headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' },
}));
