// path: app/api/health/ready/route.ts
// Readiness: the database answers. The answer carries no detail.
import { databaseReady } from '@/services/alerting/health';

export async function GET(): Promise<Response> {
  const db = await databaseReady();
  return Response.json(
    { status: db.ok ? 'ready' : 'not_ready' },
    { status: db.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
