// path: config/s16-settlement.ts
// Settings of the sub-merchant settlement ledger (STEP 16.14).
export const SETTLEMENT_MAX_BATCH = 200;
export const SETTLEMENT_MAX_HOLD_DAYS = 180;
export const SETTLEMENT_STATEMENT_ROWS = 500;
export const SETTLEMENT_STEP_UP_SECONDS = 300;
export const SETTLEMENT_ENTRY_KINDS = ['sale', 'refund', 'chargeback', 'adjustment'] as const;
export type SettlementEntryKind = (typeof SETTLEMENT_ENTRY_KINDS)[number];
