// path: services/publicapi/db-errors.ts
// Turns the answers of the integration database guards into the platform's errors.
import 'server-only';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';

export interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

export function mapIntegrationError(error: DbError): never {
  const text = error.message ?? '';
  switch (error.code) {
    case '23505':
      throw new ConflictError('This record already exists.');
    case '23514':
      throw new ValidationError('A value is not allowed.');
    case '23503':
      throw new ValidationError('A linked record was not found.');
    case 'P0002':
      throw new NotFoundError();
    case '55000':
      throw new ConflictError(text || 'This is not allowed in the current state.');
    case '42501':
      throw new ForbiddenError('This is not allowed.');
    case '22023':
      throw new ValidationError(text || 'The request is not valid.');
    default:
      throw new InternalError(error);
  }
}
