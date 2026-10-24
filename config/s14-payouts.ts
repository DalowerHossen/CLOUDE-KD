// path: config/s14-payouts.ts
// Starting values of the payout rules. The platform team changes them on the payout settings; these apply until then.

/** Smallest payout, in USD. */
export const PAYOUT_MIN_AMOUNT = '10.0000';

/** Most a company can take out in one period, in USD. */
export const PAYOUT_PERIOD_LIMIT = '10000.0000';
export const PAYOUT_PERIOD_UNIT = 'day' as const;

/** A payout of this amount or more needs the approval of the CEO (a second person). */
export const PAYOUT_LARGE_THRESHOLD = '5000.0000';

/** Fee taken from each payout: a fixed part and a percent. Zero until the platform team sets a price. */
export const PAYOUT_FEE_FIXED = '0.0000';
export const PAYOUT_FEE_PERCENT = '0';

/** Margin taken when the payout is paid in a local currency, in percent. */
export const PAYOUT_FX_FEE_PERCENT = '0';

/** A payout that fails is tried again after these hours; after the last one it fails and the money goes back. */
export const PAYOUT_RETRY_HOURS: readonly number[] = [1, 6, 24];

/** Seconds a sign-in confirmation stays fresh for a payout request or a payout method change. */
export const PAYOUT_STEP_UP_SECONDS = 600;

/** Hour (UTC) at which scheduled payouts run. */
export const PAYOUT_SCHEDULE_HOUR_UTC = 6;
