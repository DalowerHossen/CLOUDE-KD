// path: config/notifications.ts
// Notification settings (STEP 05). Values change with a deploy.
export const NOTIFICATION_CATEGORIES = [
  'invoice',
  'payment',
  'system',
  'team',
  'security',
  'kyc',
  'subscription',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Notifications one person can get in an hour; more are dropped (feature 678). Security notices are never dropped. */
export const MAX_PER_HOUR = 60;
export const MAX_MUTE_HOURS = 24 * 30;

/** Channels that are on until the person changes them. */
export const DEFAULT_CHANNELS: Readonly<
  Record<NotificationCategory, { in_app: boolean; email: boolean }>
> = {
  invoice: { in_app: true, email: false },
  payment: { in_app: true, email: false },
  system: { in_app: true, email: false },
  team: { in_app: true, email: true },
  security: { in_app: true, email: true },
  kyc: { in_app: true, email: true },
  subscription: { in_app: true, email: true },
};

/** Who in a company is told: the owner only, or the owner and the staff. */
export const COMPANY_RECIPIENTS: Readonly<Record<NotificationCategory, 'owner' | 'all'>> = {
  invoice: 'all',
  payment: 'all',
  system: 'all',
  team: 'owner',
  security: 'owner',
  kyc: 'owner',
  subscription: 'owner',
};

/** These cannot be switched off in the app or muted. */
export const ALWAYS_ON: readonly NotificationCategory[] = ['security'];
export const DIGEST_HOUR_UTC = 6;
