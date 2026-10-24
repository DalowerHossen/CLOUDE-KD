// path: lib/integrations/plaid.ts
// Plaid calls (hosts sandbox.plaid.com and production.plaid.com). Documentation read 2026-10-23: docs/integrations/plaid.md.
// The keys go in the PLAID-CLIENT-ID and PLAID-SECRET headers. Every call goes through the SSRF guard and a time limit; the keys
// and the access token never appear in an error text or a log.
import 'server-only';
import {
  PLAID_CLIENT_NAME,
  PLAID_HOSTS,
  PLAID_MAX_PAGES,
  PLAID_SYNC_PAGE,
  type PlaidEnvironment,
} from '@/config/s16-bankfeed';
import { CommerceApiError, callStore, defaultTransport, type Transport } from './commerce-http';

export interface PlaidKeys {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '');

async function post(
  keys: PlaidKeys,
  path: string,
  body: Record<string, unknown>,
  transport: Transport,
): Promise<Record<string, unknown>> {
  const { json } = await callStore(
    `${PLAID_HOSTS[keys.environment]}${path}`,
    {
      method: 'POST',
      headers: { 'plaid-client-id': keys.clientId, 'plaid-secret': keys.secret },
      json: body,
    },
    transport,
  );
  return obj(json);
}

export interface LinkStart {
  linkToken: string;
  url: string;
  expiresAt: string;
}

/**
 * Starts a Hosted Link session. With an access token the session is an update mode session for that Item (re-authentication).
 * The platform's webhook address receives the SESSION_FINISHED webhook with the public token.
 */
export async function createLink(
  keys: PlaidKeys,
  input: {
    userId: string;
    webhook: string;
    countryCodes: readonly string[];
    accessToken?: string;
    redirectTo?: string;
  },
  transport: Transport = defaultTransport,
): Promise<LinkStart> {
  const json = await post(
    keys,
    '/link/token/create',
    {
      client_name: PLAID_CLIENT_NAME,
      language: 'en',
      country_codes: input.countryCodes,
      user: { client_user_id: input.userId },
      webhook: input.webhook,
      hosted_link: input.redirectTo ? { completion_redirect_uri: input.redirectTo } : {},
      ...(input.accessToken === undefined
        ? { products: ['transactions'] }
        : { access_token: input.accessToken }),
    },
    transport,
  );
  const url = text(json.hosted_link_url, 500);
  const linkToken = text(json.link_token, 200);
  if (url === '' || linkToken === '')
    throw new CommerceApiError('Plaid did not return a link address.', 200, false);
  return { linkToken, url, expiresAt: text(json.expiration, 40) };
}

/** The result of a finished Hosted Link session (for when the webhook was missed): the public tokens, if it worked. */
export async function readLinkResult(
  keys: PlaidKeys,
  linkToken: string,
  transport: Transport = defaultTransport,
): Promise<{ finished: boolean; publicTokens: string[] }> {
  const json = await post(keys, '/link/token/get', { link_token: linkToken }, transport);
  const tokens: string[] = [];
  let finished = false;
  for (const session of arr(json.link_sessions)) {
    const s = obj(session);
    if (typeof s.finished_at === 'string') finished = true;
    for (const r of arr(obj(s.results).item_add_results)) {
      const t = text(obj(r).public_token, 200);
      if (t !== '') tokens.push(t);
    }
  }
  return { finished, publicTokens: tokens };
}

export async function exchangePublicToken(
  keys: PlaidKeys,
  publicToken: string,
  transport: Transport = defaultTransport,
): Promise<{ accessToken: string; itemId: string }> {
  const json = await post(
    keys,
    '/item/public_token/exchange',
    { public_token: publicToken },
    transport,
  );
  const accessToken = text(json.access_token, 200);
  const itemId = text(json.item_id, 100);
  if (accessToken === '' || itemId === '')
    throw new CommerceApiError('Plaid did not return the link.', 200, false);
  return { accessToken, itemId };
}

export interface PlaidAccount {
  id: string;
  name: string;
  mask: string | null;
  currency: string | null;
}

export async function listAccounts(
  keys: PlaidKeys,
  accessToken: string,
  transport: Transport = defaultTransport,
): Promise<{ institutionId: string | null; accounts: PlaidAccount[] }> {
  const json = await post(keys, '/accounts/get', { access_token: accessToken }, transport);
  const accounts: PlaidAccount[] = [];
  for (const entry of arr(json.accounts)) {
    const a = obj(entry);
    const id = text(a.account_id, 100);
    if (id === '') continue;
    const balances = obj(a.balances);
    const currency = text(balances.iso_currency_code, 3).toUpperCase();
    accounts.push({
      id,
      name: (text(a.name, 200) || text(a.official_name, 200) || 'Account').replace(/[<>]/g, ''),
      mask: text(a.mask, 20) || null,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    });
  }
  return { institutionId: text(obj(json.item).institution_id, 60) || null, accounts };
}

export interface SyncResult {
  /** Transactions to import, by account id (added and modified). */
  byAccount: Map<string, unknown[]>;
  removed: number;
  nextCursor: string;
  /** The cursor the update started from (empty for the first). */
  startCursor: string;
}

/**
 * Reads all pages of /transactions/sync after the cursor. If a page fails the whole loop starts again from the first cursor (the
 * documentation asks for that); the caller saves the new cursor only after the lines were imported.
 */
export async function syncTransactions(
  keys: PlaidKeys,
  accessToken: string,
  cursor: string,
  transport: Transport = defaultTransport,
): Promise<SyncResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const byAccount = new Map<string, unknown[]>();
      let removed = 0;
      let next = cursor;
      for (let page = 0; page < PLAID_MAX_PAGES; page += 1) {
        const json = await post(
          keys,
          '/transactions/sync',
          {
            access_token: accessToken,
            count: PLAID_SYNC_PAGE,
            ...(next === '' ? {} : { cursor: next }),
          },
          transport,
        );
        for (const t of [...arr(json.added), ...arr(json.modified)]) {
          const account = text(obj(t).account_id, 100);
          if (account === '') continue;
          const list = byAccount.get(account) ?? [];
          list.push(t);
          byAccount.set(account, list);
        }
        removed += arr(json.removed).length;
        const cursorOut = text(json.next_cursor, 500);
        if (cursorOut === '')
          throw new CommerceApiError('Plaid did not return a cursor.', 200, false);
        next = cursorOut;
        if (json.has_more !== true)
          return { byAccount, removed, nextCursor: next, startCursor: cursor };
      }
      throw new CommerceApiError(
        'The update is too long for one run. It continues next time.',
        200,
        true,
      );
    } catch (error) {
      const again =
        error instanceof CommerceApiError && /MUTATION_DURING_PAGINATION/.test(error.message);
      if (!again || attempt >= 2) throw error;
    }
  }
}

export async function removeItem(
  keys: PlaidKeys,
  accessToken: string,
  transport: Transport = defaultTransport,
): Promise<void> {
  await post(keys, '/item/remove', { access_token: accessToken }, transport);
}

/** The public key (JWK) that checks a webhook token. */
export async function webhookKey(
  keys: PlaidKeys,
  keyId: string,
  transport: Transport = defaultTransport,
): Promise<Record<string, unknown>> {
  const json = await post(keys, '/webhook_verification_key/get', { key_id: keyId }, transport);
  const key = obj(json.key);
  if (Object.keys(key).length === 0)
    throw new CommerceApiError('Plaid did not return the key.', 200, false);
  return key;
}
