// path: services/jobs/job-service.ts
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { JobService } from '@/types/contracts';

const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_-]+)+$/;
const MAX_PAYLOAD_BYTES = 32_768;

export function createJobService(): JobService {
  return {
    async enqueue(name, payload, options) {
      if (!NAME_RE.test(name)) throw new ValidationError('Invalid job name.');
      if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES)
        throw new ValidationError('The job payload is too large.');
      const { error } = await getAdminSupabase().rpc('kd_enqueue_job', {
        p_company: getContext()?.companyId ?? null,
        p_name: name,
        p_payload: payload,
        p_run_at: (options?.runAt ?? new Date()).toISOString(),
        p_max_attempts: options?.maxAttempts ?? 5,
        p_dedupe: options?.dedupeKey ?? null,
      });
      if (error) throw new InternalError(error);
    },
  };
}
