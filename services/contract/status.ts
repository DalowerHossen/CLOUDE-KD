// path: services/contract/status.ts
// The life of a contract. Pure, so the rules can be checked without a database.
export const CONTRACT_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'partly_signed',
  'signed',
  'declined',
  'void',
  'expired',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const NEXT: Readonly<Record<ContractStatus, readonly ContractStatus[]>> = {
  draft: ['sent', 'void'],
  sent: ['viewed', 'partly_signed', 'signed', 'declined', 'void', 'expired'],
  viewed: ['partly_signed', 'signed', 'declined', 'void', 'expired'],
  partly_signed: ['signed', 'declined', 'void', 'expired'],
  signed: [],
  declined: [],
  void: [],
  expired: [],
};

export function canMove(from: ContractStatus, to: ContractStatus): boolean {
  return NEXT[from].includes(to);
}

/** Only a draft can be edited; a sent contract is frozen (the signers agree to exactly that wording). */
export function isEditable(status: ContractStatus): boolean {
  return status === 'draft';
}

/** Still waiting for signatures, so reminders and a cancel make sense. */
export function isOpen(status: ContractStatus): boolean {
  return status === 'sent' || status === 'viewed' || status === 'partly_signed';
}

export const CONTRACT_PREFIX = 'CT-';
export function contractNumber(n: number): string {
  return `${CONTRACT_PREFIX}${String(n).padStart(6, '0')}`;
}
