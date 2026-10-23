// path: services/approval/db-errors.ts
// Maps SQLSTATE codes raised by the approval functions to domain errors.
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';

export function mapApprovalDbError(error: { code?: string; message?: string }): never {
  switch (error.code) {
    case '42501':
      throw new ForbiddenError(approvalForbiddenMessage(error.message ?? ''));
    case '02000':
      throw new NotFoundError();
    case '55000':
      throw new ConflictError('This request was already decided. Reload to see the result.');
    case '22023':
      throw new ValidationError(
        (error.message ?? '').includes('reason')
          ? 'A reason of at least 3 characters is required.'
          : 'The request is not valid.',
      );
    default:
      throw new InternalError(error);
  }
}

function approvalForbiddenMessage(message: string): string {
  if (message.includes('own request')) return 'You cannot decide your own request.';
  if (message.includes('higher role')) return 'This step needs a higher role.';
  if (message.includes('two different people'))
    return 'A second person must complete this approval.';
  if (message.includes('delegation')) return 'You have no active delegation for this request.';
  return 'You do not have permission to decide this request.';
}
