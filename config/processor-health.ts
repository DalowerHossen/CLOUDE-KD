// path: config/processor-health.ts
// Health check settings of the sixteen payment processors. Change values here with a deploy.
//  - healthCheckUrl: a public https address that answers while the processor's API is up. The check calls it with GET, no
//    credentials; any answer below 500 means "reachable". It is null for every processor until someone has read that
//    processor's own status or ping documentation and recorded the address in docs/processors/<id>.md (no address is
//    guessed). With null the check asks the adapter to test the saved credentials (an authenticated call to the processor).
//  - healthCheckIntervalMinutes: how often the cron job (every 10 minutes) checks this processor. At least 10.
//  - consecutiveFailuresAllowed: the processor is switched off when this many checks in a row are "down".
import { PROCESSOR_IDS, type ProcessorId } from '@/types/contracts';

export interface ProcessorHealthConfig {
  healthCheckUrl: string | null;
  healthCheckIntervalMinutes: number;
  consecutiveFailuresAllowed: number;
}

export const HEALTH_DEFAULTS: ProcessorHealthConfig = {
  healthCheckUrl: null,
  healthCheckIntervalMinutes: 10,
  consecutiveFailuresAllowed: 3,
};

/** Per-processor overrides. Everything not listed uses HEALTH_DEFAULTS. */
const OVERRIDES: Partial<Record<ProcessorId, Partial<ProcessorHealthConfig>>> = {};

export const PROCESSOR_HEALTH: Readonly<Record<ProcessorId, ProcessorHealthConfig>> =
  Object.fromEntries(
    PROCESSOR_IDS.map((id) => [id, { ...HEALTH_DEFAULTS, ...OVERRIDES[id] }]),
  ) as Record<ProcessorId, ProcessorHealthConfig>;

export function healthConfigOf(id: ProcessorId): ProcessorHealthConfig {
  return PROCESSOR_HEALTH[id];
}

/** An answer slower than this is "degraded". */
export const DEGRADED_AFTER_MS = 3000;
/** A check that takes longer than this is "down". */
export const HEALTH_TIMEOUT_MS = 10_000;
/** Check history is kept this long. */
export const HEALTH_HISTORY_DAYS = 7;
