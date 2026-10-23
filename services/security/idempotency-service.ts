// path: services/security/idempotency-service.ts
// Implements the idempotency contract on top of public.api_idempotency (functions kd_idempotency_*).
import 'server-only';
import { z } from 'zod';
import { getContext } from '@/lib/logger/correlation';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { IdempotencyService } from '@/types/contracts';

const beginSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('new') }),
  z.object({ state: z.literal('conflict') }),
  z.object({ state: z.literal('in_progress') }),
  z.object({
    state: z.literal('replay'),
    status: z.number().int(),
    body: z.string().nullable(),
    contentType: z.string().nullable(),
  }),
]);

export function createIdempotencyService(): IdempotencyService {
  const admin = getAdminSupabase;
  return {
    async begin(input) {
      const { data, error } = await admin().rpc('kd_idempotency_begin', {
        p_scope: input.scope,
        p_key: input.key,
        p_hash: input.requestHash,
        p_company: getContext()?.companyId ?? null,
      });
      if (error) throw new InternalError(error);
      const parsed = beginSchema.parse(data);
      if (parsed.state === 'replay') {
        return {
          state: 'replay',
          response: {
            status: parsed.status,
            body: parsed.body ?? '',
            contentType: parsed.contentType ?? 'application/json; charset=utf-8',
          },
        };
      }
      return { state: parsed.state };
    },
    async complete(scope, key, response) {
      const { error } = await admin().rpc('kd_idempotency_complete', {
        p_scope: scope,
        p_key: key,
        p_status: response.status,
        p_body: response.body,
        p_content_type: response.contentType,
      });
      if (error) throw new InternalError(error);
    },
    async release(scope, key) {
      const { error } = await admin().rpc('kd_idempotency_release', { p_scope: scope, p_key: key });
      if (error) throw new InternalError(error);
    },
  };
}
