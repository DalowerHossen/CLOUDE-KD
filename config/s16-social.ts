// path: config/s16-social.ts
// Social media constants (STEP 16.4). Facts are from docs/integrations/social.md (read 2026-10-23).
export const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com';
export const FACEBOOK_API_VERSION = 'v26.0';
export const THREADS_GRAPH_URL = 'https://graph.threads.com/v1.0';
export const LINKEDIN_API_URL = 'https://api.linkedin.com/rest';
/** The Marketing API version header of LinkedIn (YYYYMM). 202511 is sunset on 2026-11-16; 202610 is the version documented in October 2026. */
export const LINKEDIN_API_VERSION = '202610';
export const X_API_URL = 'https://api.x.com/2';
export const TELEGRAM_API_URL = 'https://api.telegram.org';
export const PINTEREST_API_URL = 'https://api.pinterest.com/v5';
export const SOCIAL_TIMEOUT_MS = 20_000;

export const SOCIAL_PROVIDERS = [
  'facebook',
  'instagram',
  'threads',
  'linkedin',
  'x',
  'telegram',
  'pinterest',
  'sandbox',
] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const POST_BODY_MAX = 5000;
export const INSTAGRAM_CAPTION_MAX = 2200;
export const INSTAGRAM_HASHTAGS_MAX = 30;
export const INSTAGRAM_MENTIONS_MAX = 20;
export const THREADS_TEXT_MAX = 500;
export const THREADS_TOPIC_TAG_MAX = 50;
/** A standard X post (the documentation names 280 characters; longer posts need a Premium account). */
export const X_TEXT_MAX = 280;
export const TELEGRAM_TEXT_MAX = 4096;
export const TELEGRAM_CAPTION_MAX = 1024;
export const PINTEREST_TITLE_MAX = 100;
export const PINTEREST_DESCRIPTION_MAX = 800;
/** Meta recommends waiting about 30 seconds between creating a Threads container and publishing it. */
export const THREADS_PUBLISH_DELAY_SECONDS = 30;
/** Posts an account may publish in a moving 24 hours. Instagram: the pages read say 100 and 50; the lower figure is used. */
export const DAILY_POST_LIMITS: Readonly<Record<SocialProvider, number | null>> = {
  facebook: null,
  instagram: 50,
  threads: 250,
  linkedin: null,
  x: null,
  telegram: null,
  pinterest: null,
  sandbox: null,
};
export const IG_STATUS_POLLS = 5;
export const IG_STATUS_POLL_MS = 2000;
export const MAX_ACCOUNTS_PER_COMPANY = 20;
export const MAX_HASHTAG_GROUPS = 50;
export const MAX_TAGS_PER_GROUP = 30;
export const PUBLISHING_STALE_MINUTES = 30;
export const MAX_PUBLISH_ATTEMPTS = 3;
export const SOCIAL_STEP_UP_SECONDS = 300;

/* 16.4.b: schedules, rules, evergreen queue, approval and link tracking. */
export const SCHEDULE_HORIZON_DAYS = 14;
export const MAX_SLOTS_PER_SCHEDULE_RUN = 30;
export const MAX_SCHEDULES_PER_COMPANY = 50;
export const MAX_RULES_PER_COMPANY = 50;
export const MAX_EVERGREEN_ITEMS = 500;
export const SOCIAL_LINK_CODE_LENGTH = 10;
export const SOCIAL_LINK_PATH = '/api/social/l';
export const AUTO_APPROVE_BATCH = 50;
export const LOW_QUEUE_NOTICE_DAYS = 7;
export const STATS_REFRESH_HOURS = 6;
export const STATS_WINDOW_DAYS = 30;
export const STATS_BATCH = 20;
export const ANALYTICS_MAX_DAYS = 365;

/* ---------- "Connect with Facebook" (the platform's Meta app) ---------- */
export const FACEBOOK_DIALOG_URL = `https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth`;
/** Callback path; the full address is the site address plus this path and must be listed as a valid OAuth redirect URI in the Meta app. */
export const META_CALLBACK_PATH = '/api/social/connect/facebook/callback';
/** Permissions asked at login (Pages API getting started and Instagram API with Facebook Login, read 2026-10-25). */
export const META_LOGIN_SCOPES: readonly string[] = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
];
/** How long a login may take before the pending connection is thrown away. */
export const CONNECT_SESSION_MINUTES = 15;
/** The most accounts connected from one login. */
export const CONNECT_MAX_PICKS = 10;
