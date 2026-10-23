// path: services/events/event-service.ts
// Writes domain events to the outbox (domain_events). The dispatcher in workers/runner.ts delivers them.
import 'server-only';
import { DOMAIN_EVENT_NAMES } from '@/types/events';
import { InternalError, ValidationError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EventService } from '@/types/contracts';

const MAX_PAYLOAD_BYTES = 32_768;

export function createEventService(): EventService {
  return {
    async publish(event) {
      if (!(DOMAIN_EVENT_NAMES as readonly string[]).includes(event.name)) {
        throw new ValidationError('Unknown event name.');
      }
      if (JSON.stringify(event.payload).length > MAX_PAYLOAD_BYTES) {
        throw new ValidationError('The event payload is too large.');
      }
      const { error } = await getAdminSupabase().rpc('kd_publish_event', {
        p_company: event.companyId,
        p_name: event.name,
        p_payload: event.payload,
        p_correlation: getContext()?.correlationId ?? null,
      });
      if (error) throw new InternalError(error);
    },
  };
}
