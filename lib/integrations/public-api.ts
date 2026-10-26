// path: lib/integrations/public-api.ts
// Wraps every route of the public API (`/api/public/v1`). Pipeline: correlation id -> key from the Authorization header -> key
// lookup (unknown, revoked and expired keys all give the same 401) -> scope check (403 outside the scope) -> the key's own rate
// limit with X-RateLimit-* headers -> size guard and strict validation -> idempotency -> handler -> audit -> response and usage.
// The tenant is the company of the key; a session is never used.
import 'server-only';
import { z } from 'zod';
import { isStrictObject } from '@/lib/security/zod-strict';
import type { NextRequest } from 'next/server';
import { API_VERSION, type ApiResource } from '@/config/s16-api';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import {
  type AppError,
  ForbiddenError,
  IdempotencyConflictError,
  InternalError,
  MaintenanceError,
  PayloadTooLargeError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  fromZodError,
  normalizeError,
} from '@/lib/errors';
import { createLogger, type Logger } from '@/lib/logger';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/lib/platform/controls';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { sha256Hex } from '@/lib/utils/hash';
import { idempotencyKeySchema } from '@/schemas/common';
import { authenticateKey, type KeyAuth } from '@/services/publicapi/keys';
import { hitKey, recordUsage } from '@/services/publicapi/usage';
import type { AuditEntryInput } from '@/types/contracts';
import { keyFromHeader, rateHeaders, scopeAllows, scopeFor, type RateState } from './api-key-rules';

/** Seconds until the first moment of next month (UTC), at least 60: when the monthly API quota starts again. */
function secondsToMonthEnd(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

export interface PublicApiOptions<
  B extends z.ZodTypeAny,
  Q extends z.ZodTypeAny,
  P extends z.ZodTypeAny,
> {
  /** Stable name of the route, for example "public.invoices.list". */
  id: string;
  /** The resource the route works on; the scope needed is `read:<resource>` for GET and `write:<resource>` otherwise. */
  resource: ApiResource;
  body?: B;
  query?: Q;
  params?: P;
  /** Requires the Idempotency-Key header and replays stored responses. */
  idempotent?: boolean;
  /** Mutating routes must return an audit entry. Set a reason only for routes that change nothing durable. */
  auditExempt?: string;
  maxBodyBytes?: number;
}

export interface PublicApiContext<B, Q, P> {
  request: NextRequest;
  body: B;
  query: Q;
  params: P;
  correlationId: string;
  ip: string;
  key: KeyAuth;
  companyId: string;
  mode: 'live' | 'sandbox';
  idempotencyKey: string | null;
  log: Logger;
}

export interface PublicApiResult<T> {
  status?: number;
  data: T;
  /** Cursor pagination: the cursor of the next page, or null on the last page. */
  nextCursor?: string | null;
  headers?: Record<string, string>;
  audit?: AuditEntryInput;
}

export interface RouteContext {
  params?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}

function assertStrict(schema: z.ZodTypeAny | undefined, label: string, id: string): void {
  if (schema instanceof z.ZodObject && !isStrictObject(schema)) {
    throw new Error(
      `Public API route "${id}": ${label} schema must be strict (use .strict() or strictObject).`,
    );
  }
}

async function readBody(
  request: NextRequest,
  limit: number,
): Promise<{ text: string; json: unknown }> {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    /^\d+$/.test(declared) &&
    declared.length < 12 &&
    Number.parseInt(declared, 10) > limit
  ) {
    throw new PayloadTooLargeError();
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new PayloadTooLargeError();
  if (text.length === 0) return { text, json: undefined };
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('The request body must be JSON.');
  }
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    throw new ValidationError('The request body is not valid JSON.');
  }
}

export function withPublicApi<
  B extends z.ZodTypeAny = z.ZodUndefined,
  Q extends z.ZodTypeAny = z.ZodUndefined,
  P extends z.ZodTypeAny = z.ZodUndefined,
  T = unknown,
>(
  options: PublicApiOptions<B, Q, P>,
  handler: (
    context: PublicApiContext<z.output<B>, z.output<Q>, z.output<P>>,
  ) => Promise<PublicApiResult<T>>,
): (request: NextRequest, routeContext: RouteContext) => Promise<Response> {
  assertStrict(options.body, 'body', options.id);
  assertStrict(options.query, 'query', options.id);
  assertStrict(options.params, 'params', options.id);
  const maxBody = Math.min(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, 10_485_760);
  const baseLog = createLogger({ route: options.id });

  return async (request, routeContext) => {
    const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
    return runWithContext({ correlationId }, async () => {
      const responseHeaders = new Headers({
        'x-correlation-id': correlationId,
        'x-api-version': API_VERSION,
        'cache-control': 'no-store',
      });
      let key: KeyAuth | null = null;
      let rate: RateState | null = null;
      let failed = true;
      let idempotencyScope: string | null = null;
      let idempotencyKey: string | null = null;
      const ip = getClientIp(request.headers);
      const now = new Date();
      try {
        const log = baseLog.child({ ip });
        const method = request.method.toUpperCase();
        const security = getService('security');

        // Key: a wrong, unknown, revoked or expired key all look the same, and repeated failures from one address are limited.
        const secret = keyFromHeader(request.headers.get('authorization'));
        key = secret === null ? null : await authenticateKey(secret, now);
        if (key === null) {
          const attempt = await security.rateLimit(`public-api-auth:${ip}`, 'strict');
          if (!attempt.allowed) {
            await security.raiseSecurityEvent('token_abuse', { ip, route: options.id });
            throw new RateLimitError(attempt.retryAfterSeconds);
          }
          throw new UnauthorizedError('The API key is missing or not valid.');
        }
        updateContext({ companyId: key.companyId });
        // Operations controls: maintenance stops the public API; a company cap limits one company's calls.
        {
          const controls = await import('@/services/platform/controls');
          const maintenance = await controls.getMaintenance();
          if (await controls.maintenanceActive())
            throw new MaintenanceError(maintenance.message || DEFAULT_MAINTENANCE_MESSAGE);
          const cap = await controls.capFor(key.companyId);
          if (cap !== null) {
            const { companyCapHit } = await import('@/services/security/rate-limit');
            const hit = await companyCapHit(key.companyId, cap);
            if (!hit.allowed) throw new RateLimitError(hit.retryAfterSeconds);
          }
          const { apiQuotaReached } = await import('@/services/entitlement/usage');
          if (await apiQuotaReached(key.companyId))
            throw new RateLimitError(
              secondsToMonthEnd(now),
              'The monthly API quota of your plan is used up. It starts again next month, or upgrade your plan.',
            );
        }

        const needed = scopeFor(method, options.resource);
        if (!scopeAllows(key.scopes, needed))
          throw new ForbiddenError(`This key does not have the scope ${needed}.`);

        rate = await hitKey(key, now);
        for (const [name, value] of Object.entries(rateHeaders(rate)))
          responseHeaders.set(name, value);
        if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);

        const mutating = MUTATING.has(method);
        const rawBody =
          options.body || mutating
            ? await readBody(request, maxBody)
            : { text: '', json: undefined };
        const clean = <V>(value: V): V => security.sanitize(value);
        const body = (
          options.body ? options.body.parse(clean(rawBody.json)) : undefined
        ) as z.output<B>;
        const query = (
          options.query
            ? options.query.parse(clean(Object.fromEntries(request.nextUrl.searchParams.entries())))
            : undefined
        ) as z.output<Q>;
        const params = (
          options.params
            ? options.params.parse(clean((await routeContext.params) ?? {}))
            : undefined
        ) as z.output<P>;

        if (options.idempotent) {
          const parsedKey = idempotencyKeySchema.safeParse(request.headers.get('idempotency-key'));
          if (!parsedKey.success)
            throw new ValidationError('A valid Idempotency-Key header is required.');
          idempotencyKey = parsedKey.data;
          idempotencyScope = `${key.companyId}:${key.mode}:${options.id}`;
          const requestHash = await sha256Hex(
            `${method}\n${request.nextUrl.pathname}\n${request.nextUrl.search}\n${rawBody.text}`,
          );
          const begin = await getService('idempotency').begin({
            scope: idempotencyScope,
            key: idempotencyKey,
            requestHash,
          });
          if (begin.state === 'conflict') throw new IdempotencyConflictError();
          if (begin.state === 'in_progress')
            throw new IdempotencyConflictError(
              'A request with this idempotency key is still running.',
            );
          if (begin.state === 'replay') {
            failed = begin.response.status >= 400;
            responseHeaders.set('idempotent-replayed', 'true');
            responseHeaders.set('content-type', begin.response.contentType);
            return new Response(begin.response.body, {
              status: begin.response.status,
              headers: responseHeaders,
            });
          }
        }

        const result = await handler({
          request,
          body,
          query,
          params,
          correlationId,
          ip,
          key,
          companyId: key.companyId,
          mode: key.mode,
          idempotencyKey,
          log,
        });

        if (mutating) {
          if (result.audit) {
            try {
              await getService('audit').record({
                ...result.audit,
                companyId: key.companyId,
                metadata: {
                  ...(result.audit.metadata ?? {}),
                  apiKeyId: key.id,
                  mode: key.mode,
                  via: 'public_api',
                },
              });
            } catch (auditError) {
              log.error('audit write failed', { error: auditError });
              await security.raiseSecurityEvent('other', {
                reason: 'audit_write_failed',
                route: options.id,
              });
              throw new InternalError(auditError);
            }
          } else if (!options.auditExempt) {
            log.error('mutating route returned no audit entry', { route: options.id });
            throw new InternalError(new Error(`Route ${options.id} must return an audit entry.`));
          }
        }

        for (const [name, value] of Object.entries(result.headers ?? {}))
          responseHeaders.set(name, value);
        const status = result.status ?? 200;
        const payload = JSON.stringify({
          data: result.data,
          meta: {
            correlation_id: correlationId,
            version: API_VERSION,
            ...(result.nextCursor !== undefined ? { next_cursor: result.nextCursor } : {}),
          },
        });
        if (idempotencyScope && idempotencyKey) {
          await getService('idempotency').complete(idempotencyScope, idempotencyKey, {
            status,
            body: payload,
            contentType: 'application/json; charset=utf-8',
          });
        }
        responseHeaders.set('content-type', 'application/json; charset=utf-8');
        failed = false;
        return new Response(payload, { status, headers: responseHeaders });
      } catch (thrown) {
        const error: AppError =
          thrown instanceof z.ZodError ? fromZodError(thrown) : normalizeError(thrown);
        if (idempotencyScope && idempotencyKey) {
          try {
            await getService('idempotency').release(idempotencyScope, idempotencyKey);
          } catch {
            baseLog.warn('idempotency release failed', { route: options.id });
          }
        }
        if (error.status >= 500) baseLog.error('request failed', { error: thrown });
        const response = errorResponse(error, correlationId);
        response.headers.set('x-api-version', API_VERSION);
        if (rate !== null)
          for (const [name, value] of Object.entries(rateHeaders(rate)))
            response.headers.set(name, value);
        return response;
      } finally {
        if (key !== null) await recordUsage(key, ip, failed, now);
      }
    });
  };
}
