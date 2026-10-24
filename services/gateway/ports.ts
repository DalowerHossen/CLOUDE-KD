// path: services/gateway/ports.ts
// The real ports of the forwarding service: keys, routes and upstream from the database, the guarded transport (https only, public
// addresses only, checked again when the socket opens, no redirects), the call log and the failed-key limit.
import 'server-only';
import { GATEWAY_MAX_RESPONSE_BYTES } from '@/config/s16-gateway';
import { getService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { createLogger } from '@/lib/logger';
import { safeHttpsRequest, SsrfError } from '@/lib/security/ssrf';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { CallLog, ForwardPorts } from './forward';
import { authenticateSubKey, hitSubKey, markSubKeyUsed } from './keys';
import { listRoutes } from './routes';
import { loadUpstreamTarget, noteUpstreamResult } from './upstream';

const log = createLogger({ service: 'gateway' });

function platformHost(): string | null {
  try {
    return new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).hostname;
  } catch {
    return null;
  }
}

async function writeLog(entry: CallLog): Promise<void> {
  // A call without a known key has no company to write it under; failed attempts are limited and raised as security events.
  if (entry.companyId === '') return;
  const { error } = await getAdminSupabase().from('gateway_calls').insert({
    company_id: entry.companyId,
    sub_merchant_id: entry.subMerchantId,
    key_id: entry.keyId,
    route_id: entry.routeId,
    method: entry.method,
    path_template: entry.pathTemplate,
    status_code: entry.statusCode,
    outcome: entry.outcome,
    duration_ms: entry.durationMs,
    request_bytes: entry.requestBytes,
    response_bytes: entry.responseBytes,
    correlation_id: entry.correlationId,
  });
  if (error) log.error('gateway call log failed', { error });
}

export function makeForwardPorts(): ForwardPorts {
  return {
    now: () => new Date(),
    platformHost: platformHost(),
    authenticate: authenticateSubKey,
    failedAttempt: async (ip) => {
      const result = await getService('security').rateLimit(`gateway-auth:${ip}`, 'strict');
      return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds };
    },
    hit: hitSubKey,
    loadRoutes: async (companyId) =>
      (await listRoutes(companyId)).map((r) => ({
        id: r.id,
        name: r.name,
        method: r.method,
        pathTemplate: r.pathTemplate,
        enabled: r.enabled,
      })),
    loadUpstream: loadUpstreamTarget,
    send: async (url, request) => {
      try {
        const response = await safeHttpsRequest(url, {
          method: request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          headers: request.headers,
          body: request.body,
          maxBytes: GATEWAY_MAX_RESPONSE_BYTES,
          timeoutMs: request.timeoutMs,
        });
        return {
          status: response.status,
          headers: response.headers,
          body: new Uint8Array(response.body),
        };
      } catch (error) {
        if (error instanceof SsrfError && error.reason === 'timeout') throw new Error('timeout');
        throw error;
      }
    },
    logCall: writeLog,
    noteUpstream: noteUpstreamResult,
    markUsed: markSubKeyUsed,
    securityEvent: async (kind, data) => {
      await getService('security').raiseSecurityEvent(
        kind === 'token_abuse' ? 'token_abuse' : 'other',
        data,
      );
    },
  };
}
