// path: config/email.ts
// E-mail settings (STEP 05). Values change with a deploy.
/** Templates starting with these ids carry no open or click tracking (privacy, security codes, payments). */
export const NO_TRACKING_PREFIXES: readonly string[] = ['auth.', 'security.', 'kyc.', 'payment.'];
/** Templates starting with these ids get the one-click unsubscribe header (not transactional). */
export const UNSUBSCRIBABLE_PREFIXES: readonly string[] = [
  'digest.',
  'marketing.',
  'notification.',
  'report.',
];
/** Attempts and waits (minutes) before a temporarily failing message is tried again. */
export const RETRY_MINUTES: readonly number[] = [1, 5, 15, 60, 240];
export const MAX_ATTEMPTS = 6;
/** Daily sending limit when the plan has no entitlement `email.daily_limit`. */
export const DEFAULT_DAILY_LIMIT = 1000;
/** A company younger than this many days sends at most RAMP_UP_DAILY_LIMIT a day (feature 474). */
export const RAMP_UP_DAYS = 7;
export const RAMP_UP_DAILY_LIMIT = 100;
/** Hosts that links in tenant-edited templates may point to besides the application itself (feature 487). */
export const EXTRA_LINK_HOSTS: readonly string[] = [];
export const PLATFORM_SENDER_NAME = 'KD SOLUTION IT';
/** Templates that nobody can override: sign-in, security codes and alerts keep their exact wording. */
export const LOCKED_TEMPLATE_PREFIXES: readonly string[] = ['auth.', 'security.', 'system.'];
/** Templates a company may customise for its own clients and team. */
export const TENANT_EDITABLE_PREFIXES: readonly string[] = [
  'invoice.',
  'estimate.',
  'payment.',
  'payslip.',
  'notification.',
  'digest.',
  'report.',
];
