// path: services/dispute/status.ts
// The life of a dispute case. Pure, so the rules can be checked without a database.
export const DISPUTE_STATUSES = [
  'new',
  'gathering',
  'submitted',
  'won',
  'lost',
  'accepted',
  'withdrawn',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

const NEXT: Readonly<Record<DisputeStatus, readonly DisputeStatus[]>> = {
  new: ['gathering', 'submitted', 'accepted', 'won', 'lost', 'withdrawn'],
  gathering: ['submitted', 'accepted', 'won', 'lost', 'withdrawn'],
  submitted: ['won', 'lost', 'withdrawn'],
  won: [],
  lost: [],
  accepted: [],
  withdrawn: [],
};

export function canMove(from: DisputeStatus, to: DisputeStatus): boolean {
  return NEXT[from].includes(to);
}

/** A case that still needs an answer to the processor. */
export function isOpen(status: DisputeStatus): boolean {
  return status === 'new' || status === 'gathering';
}

export function isClosed(status: DisputeStatus): boolean {
  return NEXT[status].length === 0;
}

/** The statuses a person can choose from this status (the outcome of a case is recorded with `won` or `lost`). */
export function choices(from: DisputeStatus): readonly DisputeStatus[] {
  return NEXT[from];
}
