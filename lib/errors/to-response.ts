// path: lib/errors/to-response.ts
import { ZodError } from 'zod';
import { AppError, InternalError, RateLimitError, ValidationError, type ErrorCode } from './app-error';

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
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
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
  if (error instanceof RateLimitError) headers.set('retry-after', String(error.retryAfterSeconds));
  return new Response(JSON.stringify(toErrorBody(error, correlationId)), {
    status: error.status,
    headers,
  });
}
