// path: config/storage.ts
// Storage settings (STEP 05). Values change with a deploy.
export const CHUNK_BYTES = 1024 * 1024;
export const UPLOAD_SESSION_TTL_SECONDS = 3600;
/** Longest life of a signed download link (feature 3665). */
export const SIGNED_URL_MAX_SECONDS = 3600;
export const SIGNED_URL_DEFAULT_SECONDS = 600;
/** Used when the plan has no entitlement `storage.quota_mb`. */
export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
/** Used when the plan has no entitlement `storage.monthly_upload_mb`. */
export const DEFAULT_MONTHLY_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_FILES_PER_COMPANY_PER_DAY = 2000;
/** Retention in years by category; null keeps files until they are deleted. */
export const RETENTION_YEARS: Readonly<Record<string, number | null>> = {
  invoice: 10,
  receipt: 10,
  contract: 10,
  kyc: 7,
  payslip: 10,
  evidence: 7,
  export: 1,
  attachment: null,
  logo: null,
  cms: null,
  other: null,
};
export const SUPABASE_BUCKET = 'kd-files';
