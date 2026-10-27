// path: lib/errors/app-error.ts
// Custom error classes. Only errors with `expose = true` show their message to API clients.

export type ErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'duplicate'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'network_blocked'
  | 'step_up_required'
  | 'service_unavailable'
  | 'internal_error';

export interface AppErrorOptions {
  details?: unknown;
  cause?: unknown;
  expose?: boolean;
}

type ErrorClass = abstract new (...args: never[]) => unknown;
const probes = new WeakMap<ErrorClass, { code: string; status: number } | null>();

/** The code and status a class gives its errors, found once by making one. A class that needs arguments gives null. */
function probeOf(cls: ErrorClass): { code: string; status: number } | null {
  if (!probes.has(cls)) {
    try {
      const made = new (cls as unknown as new () => { code: string; status: number })();
      probes.set(cls, { code: made.code, status: made.status });
    } catch {
      probes.set(cls, null);
    }
  }
  return probes.get(cls) ?? null;
}

export class AppError extends Error {
  /**
   * `error instanceof NotFoundError` also holds for an error of that kind made by another copy of the classes. The
   * production build loads this module more than once (route, page, service), and a plain `instanceof` then says no.
   */
  static [Symbol.hasInstance](this: ErrorClass, value: unknown): boolean {
    if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
    if (typeof value !== 'object' || value === null || !(value instanceof Error)) return false;
    const e = value as { code?: unknown; status?: unknown; expose?: unknown };
    if (typeof e.code !== 'string' || typeof e.status !== 'number' || typeof e.expose !== 'boolean')
      return false;
    if (this === AppError) return true;
    const probe = probeOf(this);
    return probe !== null && probe.code === e.code && probe.status === e.status;
  }

  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly expose: boolean;

  constructor(code: ErrorCode, status: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends AppError {
  constructor(message = 'The request contains invalid data.', issues: ValidationIssue[] = []) {
    super('validation_error', 400, message, { details: issues.length > 0 ? issues : undefined });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super('unauthorized', 401, message);
  }
}

export class StepUpRequiredError extends AppError {
  constructor(message = 'Please confirm your identity to continue.') {
    super('step_up_required', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super('forbidden', 403, message);
  }
}

export class NetworkBlockedError extends AppError {
  constructor(message = 'This action is not available from your network.') {
    super('network_blocked', 403, message);
  }
}

/** Returned for missing resources and for resources that belong to another tenant (prevents enumeration). */
export class NotFoundError extends AppError {
  constructor(message = 'The requested item was not found.') {
    super('not_found', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Another user edited this. Reload to see changes.', details?: unknown) {
    super('conflict', 409, message, { details });
  }
}

export class DuplicateError extends AppError {
  constructor(message = 'A similar item already exists.', details?: unknown) {
    super('duplicate', 409, message, { details });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = 'This idempotency key was already used with a different request.') {
    super('idempotency_conflict', 409, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'The request is too large.') {
    super('payload_too_large', 413, message);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Too many requests. Please try again later.') {
    super('rate_limited', 429, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Raised for signed-in company and public API calls while the platform is in maintenance. */
export class MaintenanceError extends AppError {
  constructor(message: string) {
    super('service_unavailable', 503, message);
  }
}

export class ServiceNotRegisteredError extends AppError {
  readonly serviceId: string;

  constructor(serviceId: string) {
    super('service_unavailable', 503, 'This feature is temporarily unavailable.', { expose: true });
    this.serviceId = serviceId;
  }
}

export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super('internal_error', 500, 'Something went wrong. Please try again.', {
      cause,
      expose: true,
    });
  }
}

/** Raised at boot when environment variables are missing or invalid. Lists names only, never values. */
export class EnvValidationError extends Error {
  readonly problems: ReadonlyArray<{ name: string; problem: string }>;

  constructor(problems: ReadonlyArray<{ name: string; problem: string }>) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `- ${p.name}: ${p.problem}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
    this.problems = problems;
  }
}
