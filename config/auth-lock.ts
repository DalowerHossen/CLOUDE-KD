// path: config/auth-lock.ts
// Authentication limits. Change values here only; no other file hard-codes them.

/** Consecutive failures (wrong password or wrong 2FA code) that start a lock. */
export const LOCK_THRESHOLD = 2;
/** Length of a lock: 2 hours. */
export const LOCK_DURATION_SECONDS = 7200;
/** Failed sign-in attempts from one address inside the window before the address is rate limited. */
export const IP_FAILURE_LIMIT = 10;
export const IP_FAILURE_WINDOW_SECONDS = 900;

/** Days an owner may use the platform before 2FA setup is enforced. */
export const OWNER_2FA_GRACE_DAYS = 7;
export const BACKUP_CODE_COUNT = 10;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_WINDOW_STEPS = 1;

/** Password rules (FEATURE_LIST 446, 447). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HISTORY_DEPTH = 5;

/** Sessions. */
export const SESSION_TIMEOUT_SECONDS = 86_400;
export const REMEMBER_ME_SECONDS = 30 * 86_400;
export const STEP_UP_DEFAULT_SECONDS = 300;

/** Links. */
export const EMAIL_VERIFICATION_TTL_SECONDS = 86_400;
export const PASSWORD_RESET_TTL_SECONDS = 3600;
export const UNLOCK_CONFIRMATION_TTL_SECONDS = 86_400;

/** Impersonation. */
export const IMPERSONATION_MAX_SECONDS = 3600;

/** Fixed minimum duration of a login attempt, so timing does not reveal whether an account exists. */
export const LOGIN_MIN_RESPONSE_MS = 600;

/** Captcha after this many failures from one address. Sign-up and reset always require it. */
/** The security check (Cloudflare Turnstile) is asked at every sign-in: 0 failures are enough to ask for it. */
export const LOGIN_CAPTCHA_AFTER_FAILURES = 0;
