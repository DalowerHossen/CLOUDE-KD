// path: services/payment/rpc.ts
// Maps database errors of the payment functions to the platform's error classes. The messages are written for the
// administrator and never contain secrets.
import type { PostgrestError } from '@supabase/supabase-js';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';

export function mapPaymentDbError(error: PostgrestError): Error {
  switch (error.code) {
    case '40001':
      return new ConflictError('This record was changed by someone else. Reload and try again.');
    case 'P0002':
      return new NotFoundError();
    case '42501':
      return new ForbiddenError(cleanMessage(error.message));
    case '22023':
    case '23514':
      return new ValidationError(cleanMessage(error.message));
    case '23505':
      return new ConflictError('This action was already done.');
    default:
      return new InternalError(error);
  }
}

function cleanMessage(message: string): string {
  return message.replace(/[^\x20-\x7e]/g, ' ').slice(0, 200);
}
