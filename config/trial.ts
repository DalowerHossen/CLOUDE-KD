// path: config/trial.ts
// Every new company starts on a free trial of this plan for this many days, with no payment details. When the trial ends
// without a paid first invoice the subscription ends and the company moves to the free plan (services/subscription/platform.ts).
export const SIGNUP_TRIAL_PLAN = 'pro';
export const SIGNUP_TRIAL_DAYS = 14;
