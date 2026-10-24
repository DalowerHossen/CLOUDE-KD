// path: lib/integrations/saltedge.ts
// Salt Edge API v6 calls (host www.saltedge.com). Documentation read 2026-10-23: docs/integrations/saltedge.md. The keys go in the
// App-id and Secret headers; when the company gave a private key every request is signed (Expires-at and Signature headers). Every
// call goes through the SSRF guard and a time limit; the keys never appear in an error text or a log. Removing a connection
// (DELETE) is not called: the guarded transport knows GET and POST only (dependency request R8).
import 'server-only';
import { SALTEDGE_API, SALTEDGE_MAX_PAGES, SALTEDGE_PAGE } from '@/config/s16-bankfeed';
import { signSaltEdgeRequest } from './bank-rules';
import { CommerceApiError, callStore, defaultTransport, type Transport } from './commerce-http';

export interface SaltEdgeKeys {
  appId: string;
  secret: string;
  /** PEM private key that signs the requests (needed for Live clients). */
  privateKey?: string;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 300): string =>
  typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '';

async function call(
  keys: SaltEdgeKeys,
  method: 'GET' | 'POST',
  path: string,
  data: Record<string, unknown> | null,
  transport: Transport,
): Promise<Record<string, unknown>> {
  const url = `${SALTEDGE_API}${path}`;
  const body = data === null ? '' : JSON.stringify({ data });
  const signed =
    keys.privateKey === undefined
      ? {}
      : signSaltEdgeRequest(keys.privateKey, method, url, body, Math.floor(Date.now() / 1000));
  const { json } = await callStore(
    url,
    {
      method,
      headers: { 'app-id': keys.appId, secret: keys.secret, ...signed },
      ...(data === null ? {} : { json: { data } }),
    },
    transport,
  );
  return obj(json);
}

/** Makes the user (customer) of one connection; the identifier is ours. */
export async function createCustomer(
  keys: SaltEdgeKeys,
  identifier: string,
  transport: Transport = defaultTransport,
): Promise<string> {
  const json = await call(keys, 'POST', '/customers', { identifier }, transport);
  const id = text(obj(json.data).customer_id, 60) || text(obj(json.data).id, 60);
  if (id === '') throw new CommerceApiError('Salt Edge did not return the customer.', 200, false);
  return id;
}

export interface SaltEdgeLink {
  url: string;
  expiresAt: string;
}

const linkOf = (json: Record<string, unknown>): SaltEdgeLink => {
  const d = obj(json.data);
  const url = text(d.connect_url, 600);
  if (url === '')
    throw new CommerceApiError('Salt Edge did not return a link address.', 200, false);
  return { url, expiresAt: text(d.expires_at, 40) };
};

/** Starts the Salt Edge Widget for a new connection. `ref` comes back on every callback (custom_fields.kd). */
export async function connectSession(
  keys: SaltEdgeKeys,
  input: { customerId: string; ref: string; returnTo: string },
  transport: Transport = defaultTransport,
): Promise<SaltEdgeLink> {
  return linkOf(
    await call(
      keys,
      'POST',
      '/connections/connect',
      {
        customer_id: input.customerId,
        consent: { scopes: ['accounts', 'transactions'] },
        attempt: {
          fetch_scopes: ['accounts', 'balance', 'transactions'],
          return_to: input.returnTo,
          custom_fields: { kd: input.ref },
        },
        automatic_refresh: true,
      },
      transport,
    ),
  );
}

/** Starts the Widget to log in again (reconnect) for an existing connection. */
export async function reconnectSession(
  keys: SaltEdgeKeys,
  connectionId: string,
  input: { ref: string; returnTo: string },
  transport: Transport = defaultTransport,
): Promise<SaltEdgeLink> {
  return linkOf(
    await call(
      keys,
      'POST',
      `/connections/${encodeURIComponent(connectionId)}/reconnect`,
      {
        consent: { scopes: ['accounts', 'transactions'] },
        attempt: { return_to: input.returnTo, custom_fields: { kd: input.ref } },
      },
      transport,
    ),
  );
}

export interface SaltEdgeConnection {
  status: string;
  providerName: string;
  failClass: string | null;
}

export async function showConnection(
  keys: SaltEdgeKeys,
  connectionId: string,
  transport: Transport = defaultTransport,
): Promise<SaltEdgeConnection> {
  const d = obj(
    (await call(keys, 'GET', `/connections/${encodeURIComponent(connectionId)}`, null, transport))
      .data,
  );
  const attempt = obj(d.last_attempt);
  return {
    status: text(d.status, 20),
    providerName: text(d.provider_name, 200).replace(/[<>]/g, ''),
    failClass: text(attempt.fail_error_class, 60) || null,
  };
}

/** Starts a new fetch at the bank without the Widget (a connection can be refreshed only when its time has come). */
export async function refreshConnection(
  keys: SaltEdgeKeys,
  connectionId: string,
  ref: string,
  transport: Transport = defaultTransport,
): Promise<void> {
  await call(
    keys,
    'POST',
    `/connections/${encodeURIComponent(connectionId)}/refresh`,
    {
      show_widget: false,
      attempt: {
        fetch_scopes: ['accounts', 'balance', 'transactions'],
        custom_fields: { kd: ref },
      },
    },
    transport,
  );
}

export interface SaltEdgeAccount {
  id: string;
  name: string;
  mask: string | null;
  currency: string | null;
}

/** All pages of a list: `meta.next_id` is the id the next page starts with. */
async function pages(
  keys: SaltEdgeKeys,
  path: string,
  query: Record<string, string>,
  transport: Transport,
): Promise<unknown[]> {
  const out: unknown[] = [];
  let from = query.from_id ?? '';
  for (let page = 0; page < SALTEDGE_MAX_PAGES; page += 1) {
    const q = new URLSearchParams({ ...query, per_page: String(SALTEDGE_PAGE) });
    if (from !== '') q.set('from_id', from);
    else q.delete('from_id');
    const json = await call(keys, 'GET', `${path}?${q.toString()}`, null, transport);
    out.push(...arr(json.data));
    const next = text(obj(json.meta).next_id, 60);
    if (next === '') return out;
    from = next;
  }
  throw new CommerceApiError(
    'The list is too long for one run. It continues next time.',
    200,
    true,
  );
}

export async function listAccounts(
  keys: SaltEdgeKeys,
  connectionId: string,
  transport: Transport = defaultTransport,
): Promise<SaltEdgeAccount[]> {
  const rows = await pages(keys, '/accounts', { connection_id: connectionId }, transport);
  const accounts: SaltEdgeAccount[] = [];
  for (const row of rows) {
    const a = obj(row);
    const id = text(a.id, 60);
    if (id === '') continue;
    const extra = obj(a.extra);
    const currency = text(a.currency_code, 3).toUpperCase();
    accounts.push({
      id,
      name: (text(a.name, 200) || text(extra.account_name, 200) || 'Account').replace(/[<>]/g, ''),
      mask: text(extra.account_number, 40).slice(-4) || null,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    });
  }
  return accounts;
}

/** The transactions of one account from an id on (the id itself comes again, the books skip it as a duplicate). */
export async function listTransactions(
  keys: SaltEdgeKeys,
  connectionId: string,
  accountId: string,
  fromId: string,
  transport: Transport = defaultTransport,
): Promise<unknown[]> {
  return pages(
    keys,
    '/transactions',
    {
      connection_id: connectionId,
      account_id: accountId,
      ...(fromId === '' ? {} : { from_id: fromId }),
    },
    transport,
  );
}
