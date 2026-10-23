// path: app/api/public/v1/status/route.ts
import { API_VERSION } from '@/config/s16-api';
import { withApi } from '@/lib/api/with-api';

/** Open answer for monitors: the API is up and which version it speaks. */
export const GET = withApi({ id: 'public.status', scope: 'public' }, async () => ({
  data: { status: 'operational' as const, version: API_VERSION, time: new Date().toISOString() },
}));
