// path: lib/container.ts
// Service container: the only way STEPs call each other. Implementations register themselves
// (services/<domain>/register.ts); consumers resolve them by id and see only the contract.
import { ServiceNotRegisteredError } from '@/lib/errors';
import type { ServiceId, ServiceMap } from '@/types/contracts';

type Registry = Partial<{ [K in ServiceId]: ServiceMap[K] }>;

const GLOBAL_KEY = Symbol.for('kd.solution.it.container');

/** One registry per process, shared across separately bundled route modules. */
function registry(): Registry {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>;
  const existing = holder[GLOBAL_KEY];
  if (existing) return existing;
  const created: Registry = {};
  holder[GLOBAL_KEY] = created;
  return created;
}

export interface RegisterOptions {
  /** A later STEP may replace a base implementation (for example the database-backed entitlement service). */
  override?: boolean;
}

export function registerService<K extends ServiceId>(id: K, implementation: ServiceMap[K], options: RegisterOptions = {}): void {
  const current = registry();
  if (current[id] !== undefined && options.override !== true) {
    throw new Error(`Service "${id}" is already registered. Use { override: true } to replace it deliberately.`);
  }
  (current as Record<K, ServiceMap[K]>)[id] = implementation;
}

export function getService<K extends ServiceId>(id: K): ServiceMap[K] {
  const service = registry()[id];
  if (service === undefined) throw new ServiceNotRegisteredError(id);
  return service as ServiceMap[K];
}

export function tryGetService<K extends ServiceId>(id: K): ServiceMap[K] | undefined {
  return registry()[id] as ServiceMap[K] | undefined;
}

export function hasService(id: ServiceId): boolean {
  return registry()[id] !== undefined;
}

/** Removes one registration. Used by verification scripts. */
export function unregisterService(id: ServiceId): void {
  delete registry()[id];
}
