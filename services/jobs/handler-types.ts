// path: services/jobs/handler-types.ts
// Shape of worker handler files. A STEP adds workers/<step>/<name>.job.ts (exports `jobHandler`) or
// workers/<step>/<name>.event.ts (exports `eventHandler`). `npm run gen` collects them into handlers.generated.ts.
import type { DomainEvent, DomainEventName } from '@/types/events';

export interface JobContext {
  jobId: string;
  attempt: number;
  companyId: string | null;
}

export interface JobHandlerDefinition {
  /** Job name used with jobs.enqueue(), for example "email.send". */
  name: string;
  handle(payload: Record<string, unknown>, context: JobContext): Promise<void>;
}

export interface EventHandlerDefinition {
  /** Unique id of the handler, for example "accounting.invoice-created". */
  id: string;
  events: readonly DomainEventName[];
  /** Must be idempotent: an event is delivered again when any handler of the event failed. */
  handle(event: DomainEvent): Promise<void>;
}
