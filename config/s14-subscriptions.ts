// path: config/s14-subscriptions.ts
// Starting values of platform subscription billing. The platform team can change the grace period and the tax rates on
// the billing settings page; these apply until then.

/** Days (counted from the due date) on which an unpaid renewal invoice gets a payment attempt and a notice. Three attempts. */
export const DUNNING_DAYS: readonly number[] = [0, 3, 7];

/** After the last attempt fails the company keeps its plan for this many days before it moves to the free plan. */
export const GRACE_DAYS = 7;

/** A renewal invoice is made this many days before the period ends (it falls due on the last day of the period). */
export const RENEWAL_INVOICE_DAYS = 7;

/** Reminder e-mails before the renewal date. */
export const RENEWAL_REMINDER_DAYS: readonly number[] = [7, 3, 1];

/** A trial ends with a notice this many days before. */
export const TRIAL_REMINDER_DAYS = 3;

/** Billing intervals. */
export const BILLING_INTERVALS = ['month', 'year'] as const;
