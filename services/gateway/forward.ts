// path: services/gateway/forward.ts
// The forwarding of one sub-merchant call to the app of the main merchant. Pipeline: key (unknown, revoked and expired look the same)
// -> address allow list -> state of the sub-merchant -> limit of the key -> method and path -> route (and the sub-merchant's own
// subset) -> query and body -> upstream and its address -> signed request through the guarded transport -> mapped answer -> log.
// All outside work goes through `ForwardPorts`, so the whole pipeline is tested with fakes (scripts/verify/step16-gateway.ts).
import {
  GATEWAY_MAX_REQUEST_BYTES,
  GATEWAY_MAX_RESPONSE_BYTES,
  GATEWAY_METHODS,
} from '@/config/s16-gateway';
import {
  checkUpstreamBase,
  cleanQuery,
  findRoute,
  gatewaySignature,
  ipAllowed,
  mapStatus,
  parseRequestPath,
  passableType,
  responseHeadersOf,
  subKeyFromHeader,
  upstreamHeaders,
  upstreamUrl,
  type Outcome,
  type RouteLike,
} from '@/lib/gateway/rules';
import { rateHeaders, type RateState } from '@/lib/integrations/api-key-rules';
import type { SubKeyAuth } from './keys';
import type { UpstreamTarget } from './upstream';

export interface ForwardRequest {
  authorization: string | null;
  ip: string;
  method: string;
  /** The path after `/api/gateway/v1`, starting with a slash. */
  path: string;
  search: string;
  body: string;
  accept: string | null;
  idempotencyKey: string | null;
  correlationId: string;
}

export interface ForwardResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

export interface SentRequest {
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutMs: number;
}

export interface SentResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

export interface CallLog {
  companyId: string;
  subMerchantId: string | null;
  keyId: string | null;
  routeId: string | null;
  method: string;
  pathTemplate: string;
  statusCode: number | null;
  outcome: Outcome;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  correlationId: string;
}

export interface ForwardPorts {
  now(): Date;
  /** The host of the platform itself, so an upstream can never point back at it. */
  platformHost: string | null;
  authenticate(secret: string, now: Date): Promise<SubKeyAuth | null>;
  /** Counts a failed key attempt of an address; not allowed means the address is limited. */
  failedAttempt(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  hit(auth: SubKeyAuth, now: Date): Promise<RateState>;
  loadRoutes(companyId: string): Promise<(RouteLike & { name: string })[]>;
  loadUpstream(companyId: string, now: Date): Promise<UpstreamTarget | null>;
  /** Sends the request. Throws an error with the message `timeout` when the app does not answer in time. */
  send(url: string, request: SentRequest): Promise<SentResponse>;
  logCall(entry: CallLog): Promise<void>;
  noteUpstream(
    companyId: string,
    upstreamId: string,
    ok: boolean,
    error: string | null,
  ): Promise<void>;
  markUsed(auth: SubKeyAuth, now: Date): Promise<void>;
  securityEvent(kind: string, data: Record<string, unknown>): Promise<void>;
}

type ErrorCodeName =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'validation_error'
  | 'payload_too_large'
  | 'service_unavailable';

function fail(
  status: number,
  code: ErrorCodeName,
  message: string,
  correlationId: string,
  headers: Record<string, string> = {},
): ForwardResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify({
      error: { code, message, details: null, correlation_id: correlationId },
    }),
  };
}

const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export async function forward(ports: ForwardPorts, req: ForwardRequest): Promise<ForwardResponse> {
  const started = Date.now();
  const now = ports.now();
  const method = req.method.toUpperCase();
  const base: Record<string, string> = {
    'x-correlation-id': req.correlationId,
    'cache-control': 'no-store',
  };
  let auth: SubKeyAuth | null = null;
  let routeId: string | null = null;
  let template = '';
  let outcome: Outcome = 'blocked';
  let statusCode: number | null = null;
  let responseBytes = 0;
  let rate: RateState | null = null;
  const requestBytes = bytesOf(req.body);

  const finish = (response: ForwardResponse, why: Outcome): ForwardResponse => {
    outcome = why;
    statusCode = response.status;
    responseBytes =
      typeof response.body === 'string' ? bytesOf(response.body) : response.body.byteLength;
    return {
      ...response,
      headers: { ...(rate ? rateHeaders(rate) : {}), ...base, ...response.headers },
    };
  };

  try {
    // 1. the key
    const secret = subKeyFromHeader(req.authorization);
    auth = secret === null ? null : await ports.authenticate(secret, now);
    if (auth === null) {
      const attempt = await ports.failedAttempt(req.ip);
      if (!attempt.allowed) {
        await ports.securityEvent('token_abuse', { ip: req.ip, route: 'gateway' });
        return fail(429, 'rate_limited', 'Too many attempts. Try again later.', req.correlationId, {
          ...base,
          'retry-after': String(attempt.retryAfterSeconds),
        });
      }
      return fail(
        401,
        'unauthorized',
        'The API key is missing or not valid.',
        req.correlationId,
        base,
      );
    }

    // 2. address, state
    if (!ipAllowed(req.ip, auth.allowedIps))
      return finish(
        fail(403, 'forbidden', 'This key cannot be used from this address.', req.correlationId),
        'blocked',
      );
    if (auth.status !== 'active')
      return finish(
        fail(403, 'forbidden', 'This account is not active.', req.correlationId),
        'blocked',
      );

    // 3. the limit of the key
    rate = await ports.hit(auth, now);
    if (!rate.allowed)
      return finish(
        fail(429, 'rate_limited', 'Too many requests.', req.correlationId, {
          'retry-after': String(rate.retryAfterSeconds),
        }),
        'rate_limited',
      );

    // 4. method, path, route
    if (!(GATEWAY_METHODS as readonly string[]).includes(method))
      return finish(
        fail(405, 'validation_error', 'This method is not supported.', req.correlationId, {
          allow: GATEWAY_METHODS.join(', '),
        }),
        'not_found',
      );
    if (parseRequestPath(req.path) === null && req.path !== '/')
      return finish(fail(404, 'not_found', 'Not found.', req.correlationId), 'not_found');
    const all = await ports.loadRoutes(auth.companyId);
    const allowed =
      auth.routeIds === null ? all : all.filter((r) => auth?.routeIds?.includes(r.id));
    const route = findRoute(allowed, method, req.path);
    if (route === null)
      return finish(fail(404, 'not_found', 'Not found.', req.correlationId), 'not_found');
    routeId = route.id;
    template = route.pathTemplate;

    // 5. query and body
    const query = cleanQuery(req.search);
    if (query === null)
      return finish(
        fail(400, 'validation_error', 'The query is not valid.', req.correlationId),
        'client_error',
      );
    if (requestBytes > GATEWAY_MAX_REQUEST_BYTES)
      return finish(
        fail(413, 'payload_too_large', 'The request is too large.', req.correlationId),
        'client_error',
      );
    if (req.body.length > 0) {
      if (!BODY_METHODS.has(method))
        return finish(
          fail(400, 'validation_error', 'This method takes no body.', req.correlationId),
          'client_error',
        );
      try {
        JSON.parse(req.body);
      } catch {
        return finish(
          fail(400, 'validation_error', 'The body is not valid JSON.', req.correlationId),
          'client_error',
        );
      }
    }

    // 6. the app
    const upstream = await ports.loadUpstream(auth.companyId, now);
    const target = upstream === null ? null : checkUpstreamBase(upstream.base, ports.platformHost);
    if (upstream === null || !upstream.enabled || target === null || !target.ok)
      return finish(
        fail(
          503,
          'service_unavailable',
          'The service of this merchant is not available.',
          req.correlationId,
        ),
        'upstream_error',
      );
    const url = upstreamUrl(target.base, req.path, query);
    const parsed = new URL(url);
    const seconds = Math.floor(now.getTime() / 1000);
    const signature = await gatewaySignature(
      upstream.secrets,
      seconds,
      method,
      `${parsed.pathname}${parsed.search}`,
      req.body,
    );
    const headers = upstreamHeaders({
      accept: req.accept,
      idempotencyKey: req.idempotencyKey,
      hasBody: req.body.length > 0,
      timestampSeconds: seconds,
      signature,
      subMerchantReference: auth.reference,
      subMerchantId: auth.subMerchantId,
      correlationId: req.correlationId,
    });

    let sent: SentResponse;
    try {
      sent = await ports.send(url, {
        method,
        headers,
        body: req.body.length > 0 ? req.body : undefined,
        timeoutMs: upstream.timeoutMs,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.message === 'timeout';
      await ports.noteUpstream(
        auth.companyId,
        upstream.id,
        false,
        timedOut ? 'The app did not answer in time.' : 'The app could not be reached.',
      );
      return finish(
        fail(
          timedOut ? 504 : 502,
          'service_unavailable',
          timedOut
            ? 'The service of this merchant did not answer in time.'
            : 'The service of this merchant could not be reached.',
          req.correlationId,
        ),
        timedOut ? 'timeout' : 'upstream_error',
      );
    }

    // 7. the answer
    const mapped = mapStatus(sent.status);
    const typeHeader = sent.headers['content-type'];
    const typeText = Array.isArray(typeHeader) ? typeHeader[0] : typeHeader;
    const unsupportedType = sent.body.byteLength > 0 && passableType(typeText) === null;
    if (!mapped.pass || unsupportedType || sent.body.byteLength > GATEWAY_MAX_RESPONSE_BYTES) {
      await ports.noteUpstream(
        auth.companyId,
        upstream.id,
        false,
        `The app answered ${sent.status}.`,
      );
      return finish(
        fail(
          502,
          'service_unavailable',
          'The service of this merchant gave an answer that cannot be passed on.',
          req.correlationId,
        ),
        'upstream_error',
      );
    }
    await ports.noteUpstream(auth.companyId, upstream.id, true, null);
    return finish(
      { status: mapped.status, headers: responseHeadersOf(sent.headers), body: sent.body },
      mapped.outcome,
    );
  } finally {
    try {
      await ports.logCall({
        companyId: auth?.companyId ?? '',
        subMerchantId: auth?.subMerchantId ?? null,
        keyId: auth?.keyId ?? null,
        routeId,
        method: method.slice(0, 10),
        pathTemplate: template,
        statusCode,
        outcome,
        durationMs: Date.now() - started,
        requestBytes,
        responseBytes,
        correlationId: req.correlationId,
      });
      if (auth !== null) await ports.markUsed(auth, now);
    } catch {
      /* The log never breaks an answer. */
    }
  }
}
