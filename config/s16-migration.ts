// path: config/s16-migration.ts
// Migration wizard constants (STEP 16.10).
export const MIGRATION_SOURCES = [
  'quickbooks',
  'zoho',
  'wave',
  'freshbooks',
  'xero',
  'generic',
] as const;
export type MigrationSource = (typeof MIGRATION_SOURCES)[number];
export const MIGRATION_TARGETS = ['clients', 'products', 'suppliers'] as const;
export type MigrationTarget = (typeof MIGRATION_TARGETS)[number];
export const MIGRATION_BATCH = 100;
export const ROLLBACK_BATCH = 50;
export const ROLLBACK_WINDOW_HOURS = 24;
export const MIGRATION_LOCK_SECONDS = 300;
export const MIGRATION_JOBS_PER_RUN = 3;
export const MIGRATION_STEP_UP_SECONDS = 300;
export const REPORT_PROBLEMS_SHOWN = 50;
