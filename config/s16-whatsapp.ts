// path: config/s16-whatsapp.ts
// WhatsApp (Meta Cloud API) constants (STEP 16.3). Facts are from docs/integrations/whatsapp.md.
export const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
/** The Graph API version of the send-message pages read on 2026-10-23. */
export const WHATSAPP_API_VERSION = 'v26.0';
export const WHATSAPP_TIMEOUT_MS = 15_000;
export const WHATSAPP_TEXT_MAX = 4096;
export const WHATSAPP_TEMPLATE_BODY_MAX = 1024;
export const WHATSAPP_TEMPLATE_HEADER_MAX = 60;
export const WHATSAPP_TEMPLATE_FOOTER_MAX = 60;
export const WHATSAPP_WINDOW_HOURS = 24;
export const WHATSAPP_TEMPLATE_LIST_PAGE = 100;
export const WHATSAPP_TEMPLATE_LIST_MAX_PAGES = 20;
export const WHATSAPP_WEBHOOK_MAX_BYTES = 2_097_152;
export const WHATSAPP_STEP_UP_SECONDS = 300;

/** Words that a person sends to stop or start messages. These are our own rule (Meta's documents do not list keywords). */
export const OPT_OUT_WORDS: readonly string[] = [
  'stop',
  'stop all',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'opt out',
  'optout',
];
export const OPT_IN_WORDS: readonly string[] = ['start', 'unstop', 'subscribe'];

/** Failure reasons in plain words, keyed by the error code of the Cloud API (support/error-codes). */
export const WHATSAPP_ERROR_TEXT: Readonly<Record<number, string>> = {
  131047:
    'More than 24 hours passed since the person last wrote. Send an approved template instead.',
  131026: 'The message could not be delivered. The number may not use WhatsApp.',
  131056: 'Too many messages to this number in a short time. Try again later.',
  131049: 'WhatsApp did not deliver this message to protect the quality of the platform.',
  130472: 'The message was not sent as part of a test run by WhatsApp.',
  131000: 'WhatsApp had an unknown problem. Try again.',
  131021: 'The sender and the recipient are the same number.',
};
