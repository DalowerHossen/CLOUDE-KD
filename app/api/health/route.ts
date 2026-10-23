// path: app/api/health/route.ts
// Liveness only: the process answers. No data is read and no service is called, so a database outage
// never makes a healthy process look dead.
export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
