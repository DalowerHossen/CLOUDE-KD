// path: lib/estimate/status.ts
// Estimate statuses and what can be done in each. Safe to import in the browser.
export const ESTIMATE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'converted',
  'void',
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const ESTIMATE_PREFIX = 'EST-';

/** A sent estimate can be taken back to a draft and changed until the client decided. */
export const canRevise = (s: EstimateStatus): boolean =>
  s === 'sent' || s === 'viewed' || s === 'expired';
export const canVoid = (s: EstimateStatus): boolean =>
  s === 'draft' || s === 'sent' || s === 'viewed' || s === 'accepted' || s === 'expired';
export const canConvert = (s: EstimateStatus): boolean => s === 'accepted';
export const isDecidable = (s: EstimateStatus): boolean => s === 'sent' || s === 'viewed';
