// path: app/api/gateway/settlement/v1/entries/route.ts
// The entry for the main merchant's app: it posts the sales, refunds and chargebacks of its sub-merchants with a settlement key
// (`Authorization: Bearer kd_stl_...`). The key is the only credential, so this route has no browser CSRF check (like the rest of
// /api/gateway/). See services/gateway/ingest.ts and docs/integrations/settlement.md.
import { INGEST_MAX_BODY_BYTES } from '@/lib/gateway/ingest-rules';
import { getClientIp } from '@/lib/api/client-ip';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { createLogger } from '@/lib/logger';
import { ingest } from '@/services/gateway/ingest';
import { makeIngestPorts } from '@/services/gateway/ingest-ports';

export const runtime = 'nodejs';

const log = createLogger({ route: 'settlement.ingest' });

export async function POST(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    const declared = request.headers.get('content-length');
    const tooBig =
      declared !== null &&
      /^\d{1,12}$/.test(declared) &&
      BigInt(declared) > BigInt(INGEST_MAX_BODY_BYTES);
    try {
      const result = await ingest(makeIngestPorts(), {
        authorization: request.headers.get('authorization'),
        ip: getClientIp(request.headers),
        rawBody: tooBig ? 'x'.repeat(INGEST_MAX_BODY_BYTES + 1) : await request.text(),
        correlationId,
      });
      return Response.json(result.body, { status: result.status, headers: result.headers });
    } catch (error) {
      log.error('settlement ingest failed', { error });
      return Response.json(
        {
          error: {
            code: 'internal_error',
            message: 'Something went wrong. Please try again.',
            details: null,
            correlation_id: correlationId,
          },
        },
        {
          status: 500,
          headers: { 'x-correlation-id': correlationId, 'cache-control': 'no-store' },
        },
      );
    }
  });
}
