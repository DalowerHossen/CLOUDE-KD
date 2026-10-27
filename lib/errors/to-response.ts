// path: lib/errors/to-response.ts
import { ZodError } from 'zod';
import { AppError, InternalError, ValidationError, type ErrorCode } from './app-error';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
    correlation_id: string;
  };
}

/** Converts a Zod error into a ValidationError that never echoes the submitted values. */
export function fromZodError(error: ZodError): ValidationError {
  return new ValidationError(
    'The request contains invalid data.',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

/** Maps any thrown value to an AppError. Unknown errors become a generic InternalError. */
const ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'duplicate',
  'idempotency_conflict',
  'rate_limited',
  'payload_too_large',
  'network_blocked',
  'step_up_required',
  'service_unavailable',
  'internal_error',
]);

/**
 * An error of ours, also when it was made by another copy of the error classes. The production build can load this module
 * twice (once for the route, once for a service), and `instanceof` then says no for an error that is ours; the shape does not.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; status?: unknown; message?: unknown; expose?: unknown };
  return (
    typeof e.code === 'string' &&
    ERROR_CODES.has(e.code) &&
    typeof e.status === 'number' &&
    typeof e.message === 'string' &&
    typeof e.expose === 'boolean'
  );
}

export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) return fromZodError(error);
  return new InternalError(error);
}

export function toErrorBody(error: AppError, correlationId: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.expose ? error.message : 'Something went wrong. Please try again.',
      details: error.expose ? (error.details ?? null) : null,
      correlation_id: correlationId,
    },
  };
}

export function errorResponse(error: AppError, correlationId: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-correlation-id': correlationId,
  });
  const wait = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  if (error.code === 'rate_limited' && typeof wait === 'number')
    headers.set('retry-after', String(wait));
  return new Response(JSON.stringify(toErrorBody(error, correlationId)), {
    status: error.status,
    headers,
  });
}
