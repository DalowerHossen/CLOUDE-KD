// path: lib/middleware/bot-detector.ts
// User-agent validation and headless browser detection for browser-facing routes.
// Server-to-server routes (webhooks, cron, public API, health) are not inspected here.
const MAX_UA_LENGTH = 512;

const HEADLESS = [
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
  /electron\//i,
  /cypress/i,
];
const SCRAPERS = [
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /go-http-client/i,
  /java\/\d/i,
  /libwww-perl/i,
  /okhttp/i,
  /httpclient/i,
  /wget\//i,
  /curl\//i,
  /node-fetch/i,
  /axios\//i,
  /httpie/i,
  /postmanruntime/i,
  /insomnia/i,
  /masscan/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /acunetix/i,
  /nessus/i,
];

const SERVER_PREFIXES: readonly string[] = [
  '/api/webhooks/',
  '/api/cron/',
  '/api/public/',
  '/api/gateway/',
  '/api/health',
  // E-mail providers, mail clients (one-click unsubscribe, images, links) call these without a browser session.
  '/api/email/webhooks/',
  '/api/email/unsubscribe/',
  '/api/email/track/',
];

export type BotVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing_user_agent' | 'invalid_user_agent' | 'headless' | 'scanner' };

export function isServerToServerPath(pathname: string): boolean {
  return SERVER_PREFIXES.some((p) => pathname.startsWith(p));
}

export function inspectUserAgent(userAgent: string | null, pathname: string): BotVerdict {
  if (isServerToServerPath(pathname)) return { ok: true };
  if (userAgent === null || userAgent.trim().length === 0)
    return { ok: false, reason: 'missing_user_agent' };
  if (userAgent.length > MAX_UA_LENGTH || !/^[\x20-\x7e]+$/.test(userAgent))
    return { ok: false, reason: 'invalid_user_agent' };
  if (HEADLESS.some((re) => re.test(userAgent))) return { ok: false, reason: 'headless' };
  if (SCRAPERS.some((re) => re.test(userAgent))) return { ok: false, reason: 'scanner' };
  return { ok: true };
}
