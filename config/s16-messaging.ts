// path: config/s16-messaging.ts
// Multi-channel messaging constants (STEP 16.9). Channels are the two with an adapter that is documented and built in this platform:
// e-mail and WhatsApp. SMS, Telegram and Viber are not available (their documentation could not be read).
export const MESSAGING_CHANNELS = ['email', 'whatsapp'] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/** The route used for a message kind that has no route of its own. */
export const DEFAULT_CHAIN: readonly MessagingChannel[] = ['email', 'whatsapp'];
export const EMAIL_TEMPLATE_ID = 'integrations.broadcast';
export const CAMPAIGN_MAX_AUDIENCE = 5000;
export const CAMPAIGN_BATCH = 20;
export const MESSAGE_BATCH = 20;
/** After this many hours without enough answers, an A/B test picks the best variant even with a small sample. */
export const AB_MAX_EXTENSION_HOURS = 72;
export const ENGAGEMENT_WINDOW_DAYS = 7;
export const MAX_ROUTES = 50;
export const MESSAGING_STEP_UP_SECONDS = 300;
