// path: lib/logger/correlation.ts
// Request context (correlation id, tenant, actor) carried through async calls.
import { AsyncLocalStorage } from 'node:async_hooks';
import { uuidv7 } from '@/lib/utils/uuid';

export interface RequestContext {
  correlationId: string;
  companyId?: string | null;
  actorId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

const INCOMING_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function newCorrelationId(): string {
  return uuidv7();
}

/** Accepts a client supplied id only when it is a safe token; otherwise creates a new one. */
export function resolveCorrelationId(incoming: string | null | undefined): string {
  return incoming && INCOMING_ID.test(incoming) ? incoming : newCorrelationId();
}

export function runWithContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Updates fields of the active context (for example once the actor is known). */
export function updateContext(patch: Partial<Omit<RequestContext, 'correlationId'>>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}
