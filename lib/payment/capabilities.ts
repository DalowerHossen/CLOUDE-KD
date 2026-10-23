// path: lib/payment/capabilities.ts
// Capability checks: the core asks these questions before it calls an optional adapter operation, so a missing
// operation is a clear refusal and never a crash.
import { ValidationError } from '@/lib/errors';
import type { ProcessorAdapter } from '@/types/contracts';

/** The adapter must declare consistent capabilities and the operations that go with them. Returns problems found. */
export function adapterProblems(adapter: ProcessorAdapter): string[] {
  const problems: string[] = [];
  const caps = adapter.capabilities;
  if (caps.supportsAuthCapture && (!adapter.capture || !adapter.voidAuthorization)) {
    problems.push('supportsAuthCapture needs capture and voidAuthorization');
  }
  if (!caps.supportsAuthCapture && !adapter.charge) {
    problems.push('a processor without authorize and capture needs charge');
  }
  if (caps.supportsPartialRefund && !caps.supportsRefund) {
    problems.push('partial refunds need refunds');
  }
  const defaults = caps.modes.filter((m) => m.isDefault);
  if (caps.modes.length === 0 || defaults.length !== 1) {
    problems.push('exactly one default mode is required');
  }
  const ids = new Set(caps.modes.map((m) => m.id));
  if (ids.size !== caps.modes.length) problems.push('mode ids must be unique');
  const keys = new Set(adapter.credentialFields.map((f) => f.key));
  if (keys.size !== adapter.credentialFields.length)
    problems.push('credential field keys must be unique');
  if (caps.currencies.length === 0) problems.push('currencies must not be empty');
  return problems;
}

export function requireCapture(
  adapter: ProcessorAdapter,
): NonNullable<ProcessorAdapter['capture']> {
  if (!adapter.capabilities.supportsAuthCapture || !adapter.capture) {
    throw new ValidationError(`${adapter.displayName} does not support separate capture.`);
  }
  return adapter.capture.bind(adapter);
}

export function requireVoid(
  adapter: ProcessorAdapter,
): NonNullable<ProcessorAdapter['voidAuthorization']> {
  if (!adapter.capabilities.supportsAuthCapture || !adapter.voidAuthorization) {
    throw new ValidationError(`${adapter.displayName} does not support voiding an authorization.`);
  }
  return adapter.voidAuthorization.bind(adapter);
}

export function requireCharge(adapter: ProcessorAdapter): NonNullable<ProcessorAdapter['charge']> {
  if (!adapter.charge) {
    throw new ValidationError(`${adapter.displayName} does not support a single step charge.`);
  }
  return adapter.charge.bind(adapter);
}

export function requireRefund(adapter: ProcessorAdapter, partial: boolean): void {
  if (!adapter.capabilities.supportsRefund) {
    throw new ValidationError(`${adapter.displayName} does not support refunds.`);
  }
  if (partial && !adapter.capabilities.supportsPartialRefund) {
    throw new ValidationError(`${adapter.displayName} supports full refunds only.`);
  }
}

export function supportsCurrency(adapter: ProcessorAdapter, currency: string): boolean {
  return adapter.capabilities.currencies.includes(currency);
}
