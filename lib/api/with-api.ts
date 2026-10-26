// path: lib/api/with-api.ts
// Wraps every API route handler. Pipeline (CONTRACTS.md section "Cross-STEP data rules", item 3):
// correlation id -> size guard -> network check -> rate limit -> authentication -> step-up -> tenant ->
// permission -> sanitize and strict validation -> idempotency -> handler -> audit -> response.
// Any failure becomes the standard error response { error: { code, message, details, correlation_id } }.
import { z } from 'zod';
import { isStrictObject } from '@/lib/security/zod-strict';
import type { NextRequest } from 'next/server';
import { getService } from '@/lib/container';
import { moduleForApi } from '@/config/features';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/lib/platform/controls';
import type * as PlatformControls_ from '@/services/platform/controls';
import {
  type AppError,
  ForbiddenError,
  IdempotencyConflictError,
  InternalError,
  MaintenanceError,
  NetworkBlockedError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  fromZodError,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { createLogger, type Logger } from '@/lib/logger';
import { sha256Hex } from '@/lib/utils/hash';
import { idempotencyKeySchema } from '@/schemas/common';
import type {
  Actor,
  AuditEntryInput,
  NetworkContext,
  Role,
  TenantContext,
} from '@/types/contracts';
import { PLATFORM_ROLES } from '@/types/contracts';
import { getClientIp } from './client-ip';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const HARD_MAX_BODY_BYTES = 10_485_760;

type PlatformControls = typeof PlatformControls_;

const controlsLog = createLogger({ component: 'api-controls' });

/** The operations controls are optional for a request: if their code cannot be loaded the request goes on, and it is logged. */
async function loadControls(): Promise<PlatformControls | null> {
  try {
    return await import('@/services/platform/controls');
  } catch (error) {
    controlsLog.error('operations controls could not be loaded', { error });
    return null;
  }
}

export type ApiScope = 'public' | 'tenant' | 'platform';

export interface ApiOptions<
  B extends z.ZodTypeAny,
  Q extends z.ZodTypeAny,
  P extends z.ZodTypeAny,
> {
  /** Stable name of the route, used for rate limit keys and idempotency scope, for example "invoices.create". */
  id: string;
  /** public: no login. tenant: login plus tenant context. platform: login as super_admin, ceo or admin_staff. */
  scope: ApiScope;
  /** Restricts the roles that may call the route (in addition to scope). */
  roles?: readonly Role[];
  /** Permission action checked through the permission contract, for example "invoice.create". */
  permission?: { action: string; resourceType?: string };
  body?: B;
  query?: Q;
  params?: P;
  /** Rate limit policy name from the security configuration. Default "api-default". */
  rateLimitPolicy?: string;
  /** Applies the VPN, proxy and Tor policy for this context. */
  networkContext?: NetworkContext;
  /** Requires 2FA plus a fresh identity check within the given age. */
  stepUp?: { maxAgeSeconds: number };
  /** Requires the Idempotency-Key header and replays stored responses. */
  idempotent?: boolean;
  /** Mutating routes must return an audit entry. Set a reason only for routes that change nothing durable. */
  auditExempt?: string;
  maxBodyBytes?: number;
}

export interface ApiContext<B, Q, P> {
  request: NextRequest;
  body: B;
  query: Q;
  params: P;
  correlationId: string;
  ip: string;
  actor: Actor | null;
  tenant: TenantContext | null;
  idempotencyKey: string | null;
  log: Logger;
}

export interface ApiResult<T> {
  status?: number;
  data: T;
  headers?: Record<string, string>;
  audit?: AuditEntryInput;
}

export interface RouteContext {
  /** Next.js 16 passes route params as a promise. */
  params?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}

function assertStrict(schema: z.ZodTypeAny | undefined, label: string, id: string): void {
  if (schema instanceof z.ZodObject && !isStrictObject(schema)) {
    throw new Error(
      `API route "${id}": ${label} schema must be strict (use .strict() or strictObject).`,
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

const lastErrorRecord = new Map<string, number>();

/**
 * Keeps a short, value-free note of a server failure in the security events (once a minute per route and server), so a platform
 * administrator can read what failed behind "Something went wrong" together with its correlation id. Never throws.
 */
async function recordServerError(
  route: string,
  thrown: unknown,
  correlationId: string,
): Promise<void> {
  const now = Date.now();
  if (now - (lastErrorRecord.get(route) ?? 0) < 60_000) return;
  lastErrorRecord.set(route, now);
  const e = thrown as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown } | null;
  const cause = e?.cause as { code?: unknown; message?: unknown } | undefined;
  const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '');
  try {
    await getService('security').raiseSecurityEvent('other', {
      reason: 'api_internal_error',
      route,
      correlationId,
      name: text(e?.name),
      message: text(e?.message),
      code: text(e?.code) || text(cause?.code),
      causeMessage: text(cause?.message),
    });
  } catch {
    // Recording must never make the failure worse.
  }
}

export function withApi<
  B extends z.ZodTypeAny = z.ZodUndefined,
  Q extends z.ZodTypeAny = z.ZodUndefined,
  P extends z.ZodTypeAny = z.ZodUndefined,
  T = unknown,
>(
  options: ApiOptions<B, Q, P>,
  handler: (context: ApiContext<z.output<B>, z.output<Q>, z.output<P>>) => Promise<ApiResult<T>>,
): (request: NextRequest, routeContext: RouteContext) => Promise<Response> {
  assertStrict(options.body, 'body', options.id);
  assertStrict(options.query, 'query', options.id);
  assertStrict(options.params, 'params', options.id);
  const maxBody = Math.min(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, HARD_MAX_BODY_BYTES);
  const baseLog = createLogger({ route: options.id });

  return async (request, routeContext) => {
    const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
    return runWithContext({ correlationId }, async () => {
      const responseHeaders = new Headers({
        'x-correlation-id': correlationId,
        'cache-control': 'no-store',
      });
      let idempotencyScope: string | null = null;
      let idempotencyKey: string | null = null;
      try {
        const ip = getClientIp(request.headers);
        const log = baseLog.child({ ip });
        const method = request.method.toUpperCase();
        const mutating = MUTATING.has(method);
        const security = getService('security');

        if (options.networkContext) {
          const network = await security.checkNetwork(ip, options.networkContext);
          if (!network.allowed) throw new NetworkBlockedError();
        }
        const rate = await security.rateLimit(
          `${options.id}:${ip}`,
          options.rateLimitPolicy ?? 'api-default',
        );
        if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);

        let actor: Actor | null = null;
        let tenant: TenantContext | null = null;
        if (options.scope !== 'public') {
          actor = await getService('auth').getActor();
          if (!actor) throw new UnauthorizedError();
          updateContext({ actorId: actor.userId, companyId: actor.companyId });
          if (options.roles && !options.roles.includes(actor.role)) throw new ForbiddenError();
          if (options.scope === 'platform' && !PLATFORM_ROLES.includes(actor.role))
            throw new NotFoundError();
          if (options.stepUp) await getService('auth').requireStepUp(actor, options.stepUp);
          if (options.scope === 'tenant') {
            tenant = await getService('tenant').getTenantContext();
            updateContext({ companyId: tenant.companyId });
            // Operations controls: maintenance stops company traffic (platform staff pass); a company cap limits one company.
            if (!PLATFORM_ROLES.includes(actor.role)) {
              const controls = await loadControls();
              const maintenance = controls ? await controls.getMaintenance() : null;
              if (controls && maintenance && (await controls.maintenanceActive()))
                throw new MaintenanceError(maintenance.message || DEFAULT_MAINTENANCE_MESSAGE);
              const cap = controls ? await controls.capFor(tenant.companyId) : null;
              if (cap !== null) {
                const { companyCapHit } = await import('@/services/security/rate-limit');
                const hit = await companyCapHit(tenant.companyId, cap);
                if (!hit.allowed) throw new RateLimitError(hit.retryAfterSeconds);
              }
            }
            // Loaded only for the paths of optional modules, so the other routes (and their checks) do not need the module code.
            if (moduleForApi(request.nextUrl.pathname)) {
              const { assertApiModuleEnabled } = await import('@/services/company/module-access');
              await assertApiModuleEnabled(request.nextUrl.pathname, tenant.companyId);
            }
          }
          if (options.permission) {
            const allowed = await getService('permissions').can(
              actor,
              options.permission.action,
              options.permission.resourceType
                ? { type: options.permission.resourceType }
                : undefined,
            );
            if (!allowed) throw new ForbiddenError();
          }
        }

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
          const header = request.headers.get('idempotency-key');
          const parsedKey = idempotencyKeySchema.safeParse(header);
          if (!parsedKey.success)
            throw new ValidationError('A valid Idempotency-Key header is required.');
          idempotencyKey = parsedKey.data;
          idempotencyScope = `${tenant?.companyId ?? actor?.userId ?? 'public'}:${options.id}`;
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
          actor,
          tenant,
          idempotencyKey,
          log,
        });

        if (mutating) {
          if (result.audit) {
            try {
              await getService('audit').record(result.audit);
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
          meta: { correlation_id: correlationId },
        });
        if (idempotencyScope && idempotencyKey) {
          await getService('idempotency').complete(idempotencyScope, idempotencyKey, {
            status,
            body: payload,
            contentType: 'application/json; charset=utf-8',
          });
        }
        responseHeaders.set('content-type', 'application/json; charset=utf-8');
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
        if (error.status >= 500) {
          baseLog.error('request failed', { error: thrown });
          await recordServerError(options.id, thrown, correlationId);
        }
        return errorResponse(error, correlationId);
      }
    });
  };
}
