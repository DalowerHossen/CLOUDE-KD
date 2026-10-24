// path: services/gateway/ingest.ts
// The pipeline that takes entries from the main merchant's app: key -> address list -> limit of the key -> body -> sub-merchant by
// reference -> entries posted. All outside work goes through `IngestPorts`, so the pipeline is tested with fakes
// (scripts/verify/step16-settlement-ingest.ts). The answer is a plain object; the route turns it into a response.
import {
  INGEST_MAX_BODY_BYTES,
  ingestBatch,
  ingestKeyFromHeader,
} from '@/lib/gateway/ingest-rules';
import { ipAllowed } from '@/lib/gateway/rules';
import type { IngestKeyAuth } from './ingest-keys';

export interface IngestRequest {
  authorization: string | null;
  ip: string;
  rawBody: string;
  correlationId: string;
}

export interface IngestResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface IngestPostResult {
  posted: number;
  duplicates: string[];
  failed: { externalRef: string; message: string }[];
}

export interface IngestPorts {
  now(): Date;
  authenticate(secret: string, now: Date): Promise<IngestKeyAuth | null>;
  failedAttempt(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  /** Counts the call in the minute window of the key; false when the key is over its limit. */
  hit(auth: IngestKeyAuth, now: Date): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  findSubMerchant(
    companyId: string,
    reference: string,
  ): Promise<{ id: string; status: 'active' | 'suspended' | 'closed' } | null>;
  post(
    auth: IngestKeyAuth,
    subMerchantId: string,
    entries: ReturnType<typeof ingestBatch.parse>['entries'],
  ): Promise<IngestPostResult>;
  markUsed(auth: IngestKeyAuth, now: Date): Promise<void>;
  securityEvent(kind: string, data: Record<string, unknown>): Promise<void>;
}

function reply(
  status: number,
  correlationId: string,
  body: unknown,
  headers: Record<string, string> = {},
): IngestResponse {
  return {
    status,
    headers: { 'x-correlation-id': correlationId, 'cache-control': 'no-store', ...headers },
    body,
  };
}

const failure = (
  status: number,
  code: string,
  message: string,
  correlationId: string,
  headers?: Record<string, string>,
): IngestResponse =>
  reply(
    status,
    correlationId,
    { error: { code, message, details: null, correlation_id: correlationId } },
    headers,
  );

export async function ingest(ports: IngestPorts, req: IngestRequest): Promise<IngestResponse> {
  const now = ports.now();
  const id = req.correlationId;
  const secret = ingestKeyFromHeader(req.authorization);
  const auth = secret === null ? null : await ports.authenticate(secret, now);
  if (auth === null) {
    const attempt = await ports.failedAttempt(req.ip);
    if (!attempt.allowed) {
      await ports.securityEvent('token_abuse', { ip: req.ip, route: 'settlement.ingest' });
      return failure(429, 'rate_limited', 'Too many attempts. Try again later.', id, {
        'retry-after': String(attempt.retryAfterSeconds),
      });
    }
    return failure(401, 'unauthorized', 'The key is missing or not valid.', id);
  }
  if (!ipAllowed(req.ip, auth.allowedIps))
    return failure(403, 'forbidden', 'This key cannot be used from this address.', id);
  const rate = await ports.hit(auth, now);
  if (!rate.allowed)
    return failure(429, 'rate_limited', 'Too many requests.', id, {
      'retry-after': String(rate.retryAfterSeconds),
    });
  await ports.markUsed(auth, now);

  if (new TextEncoder().encode(req.rawBody).byteLength > INGEST_MAX_BODY_BYTES)
    return failure(413, 'payload_too_large', 'The request is too large.', id);
  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return failure(400, 'validation_error', 'The body is not valid JSON.', id);
  }
  const parsed = ingestBatch.safeParse(json);
  if (!parsed.success)
    return failure(
      400,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'The entries are not valid.',
      id,
    );
  const sub = await ports.findSubMerchant(auth.companyId, parsed.data.subMerchantReference);
  if (sub === null) return failure(404, 'not_found', 'The sub-merchant was not found.', id);
  if (sub.status === 'closed')
    return failure(409, 'conflict', 'A closed sub-merchant takes no new entries.', id);
  const result = await ports.post(auth, sub.id, parsed.data.entries);
  return reply(201, id, { data: result, meta: { correlation_id: id } });
}
