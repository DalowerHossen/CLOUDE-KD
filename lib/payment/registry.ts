// path: lib/payment/registry.ts
// The registry lists all sixteen processors (config/processors.ts) and resolves an adapter through the generated index
// (lib/payment/adapters/index.generated.ts). A processor whose adapter file is not in code is listed as "not available":
// it cannot be configured, tested or enabled (REQ-ADMIN-CONNECT item 6).
import { PROCESSORS, PROCESSOR_BY_ID } from '@/config/processors';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { adapterProblems } from '@/lib/payment/capabilities';
import { adapterLoaders } from '@/lib/payment/adapters/index.generated';
import {
  PROCESSOR_IDS,
  type ProcessorAdapter,
  type ProcessorId,
  type ProcessorMetadata,
} from '@/types/contracts';

const cache = new Map<ProcessorId, ProcessorAdapter>();

export interface RegistryEntry {
  metadata: ProcessorMetadata;
  /** True only when an adapter file exists in code. */
  available: boolean;
}

export function isKnownProcessor(value: unknown): value is ProcessorId {
  return typeof value === 'string' && (PROCESSOR_IDS as readonly string[]).includes(value);
}

export function hasAdapter(id: ProcessorId): boolean {
  return adapterLoaders[id] !== undefined;
}

export function listRegistry(): RegistryEntry[] {
  return PROCESSORS.map((metadata) => ({ metadata, available: hasAdapter(metadata.id) }));
}

export function processorMetadata(id: ProcessorId): ProcessorMetadata {
  return PROCESSOR_BY_ID[id];
}

/** Loads and validates the adapter. Refuses an unknown id, a missing adapter and an adapter that breaks the contract. */
export async function loadAdapter(id: string): Promise<ProcessorAdapter> {
  if (!isKnownProcessor(id)) throw new NotFoundError('Unknown payment processor.');
  const cached = cache.get(id);
  if (cached) return cached;
  const loader = adapterLoaders[id];
  if (!loader) {
    throw new ValidationError(`${PROCESSOR_BY_ID[id].name} has no adapter in this build yet.`);
  }
  const mod = await loader();
  const adapter = mod.adapter;
  if (adapter.id !== id) {
    throw new ValidationError(`The adapter file for ${id} declares another id.`);
  }
  const problems = adapterProblems(adapter);
  if (problems.length > 0) {
    logger.error('adapter breaks the contract', { processor: id, problems });
    throw new ValidationError(
      `The adapter for ${PROCESSOR_BY_ID[id].name} is not valid: ${problems.join('; ')}.`,
    );
  }
  cache.set(id, adapter);
  return adapter;
}

/** Verification scripts use this to install a fake adapter without a file. */
export function registerAdapterForVerification(adapter: ProcessorAdapter): void {
  cache.set(adapter.id, adapter);
}

export function clearAdapterCache(): void {
  cache.clear();
}
