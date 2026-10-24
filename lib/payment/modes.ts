// path: lib/payment/modes.ts
// Front-end modes of a processor (REQ-NMI-MODES): exactly one is active. Switching needs a passing test of the target
// mode for the current credentials and environment, valid for MODE_TEST_VALID_HOURS. The database function
// kd_processor_switch_mode enforces this; this file holds the checks the application makes before it asks.
import { MODE_TEST_VALID_HOURS } from '@/config/payment-risk';
import { ValidationError } from '@/lib/errors';
import type { ProcessorAdapter, ProcessorMode } from '@/types/contracts';

export const MODE_ID_PATTERN = /^[a-z0-9_]{1,40}$/;

export function defaultMode(adapter: ProcessorAdapter): ProcessorMode {
  const found = adapter.capabilities.modes.find((m) => m.isDefault);
  if (!found) throw new ValidationError('The adapter declares no default mode.');
  return found;
}

/** The mode must be one the adapter declares. */
export function requireMode(adapter: ProcessorAdapter, modeId: string): ProcessorMode {
  const found = adapter.capabilities.modes.find((m) => m.id === modeId);
  if (!MODE_ID_PATTERN.test(modeId) || !found) {
    throw new ValidationError('Unknown mode for this processor.');
  }
  return found;
}

/** True when a test taken at `testedAt` still allows a switch at `now`. */
export function testStillValid(testedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - testedAt.getTime();
  return ageMs >= 0 && ageMs <= MODE_TEST_VALID_HOURS * 3_600_000;
}

/** A processor with a single mode has nothing to switch. */
export function hasChoice(adapter: ProcessorAdapter): boolean {
  return adapter.capabilities.modes.length > 1;
}

/** Pure description of a switch, for the audit entry. */
export function describeSwitch(from: string, to: string, testId: string): Record<string, string> {
  return { from, to, testId };
}
