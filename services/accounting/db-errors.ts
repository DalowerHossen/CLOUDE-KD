// path: services/accounting/db-errors.ts
// Turns the answers of the accounting database functions and guards into the platform's errors.
import 'server-only';
import {
  ConflictError,
  DuplicateError,
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

export function mapAccountingError(error: DbError): never {
  const text = error.message ?? '';
  switch (error.code) {
    case 'KD001':
      throw new DuplicateError('An entry with the same date and lines already exists.', {
        entryId: error.details ?? null,
      });
    case '23514':
      throw new ValidationError(text || 'The entry does not balance.');
    case '23505':
      throw new ConflictError(
        text.includes('accounts') || text.includes('uq_accounts')
          ? 'An account with this number already exists.'
          : 'This record already exists.',
      );
    case '40001':
      throw new ConflictError('Someone else changed this record. Reload and try again.');
    case 'P0002':
      throw new NotFoundError();
    case '55000':
      throw new ConflictError(text || 'This is not allowed in the current state.');
    case '42501':
      throw new ForbiddenError(text || 'This is not allowed.');
    case '22023':
      throw new ValidationError(text || 'The request is not valid.');
    case '23503':
      throw new ValidationError('A linked record was not found.');
    default:
      throw new InternalError(error);
  }
}
