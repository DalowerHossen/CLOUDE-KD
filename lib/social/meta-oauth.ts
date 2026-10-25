// path: lib/social/meta-oauth.ts
// "Connect with Facebook": the login address, the two token exchanges and the list of Pages (with their Instagram accounts).
// Read 2026-10-25 from the official pages: Manually Build a Login Flow, Long-lived access tokens, Pages API getting started,
// Instagram API with Facebook Login get started. The calls that carry the app secret use the address the documentation shows
// (a GET with the secret in the query) on the fixed host only, with a time limit, and never log or return an address.
import 'server-only';
import { z } from 'zod';
import {
  FACEBOOK_API_VERSION,
  FACEBOOK_DIALOG_URL,
  FACEBOOK_GRAPH_URL,
  META_LOGIN_SCOPES,
  SOCIAL_TIMEOUT_MS,
} from '@/config/s16-social';
import { graph, SocialApiError, defaultFetcher, type Fetcher } from './graph';
import { sha256Hex } from '@/lib/utils/hash';

const base = `${FACEBOOK_GRAPH_URL}/${FACEBOOK_API_VERSION}`;

export function loginUrl(appId: string, redirectUri: string, state: string): string {
  const url = new URL(FACEBOOK_DIALOG_URL);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', META_LOGIN_SCOPES.join(','));
  return url.toString();
}

/** The state is an unguessable text; only its hash is kept. */
export const stateHash = (state: string): Promise<string> => sha256Hex(`meta-state:${state}`);

const tokenAnswer = z.object({
  access_token: z.string().min(20).max(1000),
  expires_in: z.number().optional(),
});

async function exchange(
  params: Record<string, string>,
  fetcher: Fetcher,
): Promise<z.infer<typeof tokenAnswer>> {
  const url = `${base}/oauth/access_token?${new URLSearchParams(params).toString()}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      signal: AbortSignal.timeout(SOCIAL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new SocialApiError('Facebook could not be reached. Try again.', null, 0, true);
  }
  const json: unknown = await response.json().catch(() => null);
  const parsed = tokenAnswer.safeParse(json);
  if (!response.ok || !parsed.success)
    throw new SocialApiError(
      'Facebook did not accept the login. Try again.',
      null,
      response.status,
      false,
    );
  return parsed.data;
}

/** Login code to a short-lived user token. `redirectUri` must equal the one used to start the login. */
export const exchangeCode = (
  creds: { appId: string; appSecret: string },
  redirectUri: string,
  code: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<z.infer<typeof tokenAnswer>> =>
  exchange(
    { client_id: creds.appId, redirect_uri: redirectUri, client_secret: creds.appSecret, code },
    fetcher,
  );

/** Short-lived user token to a long-lived one (about 60 days); Page tokens made from it do not expire. */
export const longLivedUserToken = (
  creds: { appId: string; appSecret: string },
  shortToken: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<z.infer<typeof tokenAnswer>> =>
  exchange(
    {
      grant_type: 'fb_exchange_token',
      client_id: creds.appId,
      client_secret: creds.appSecret,
      fb_exchange_token: shortToken,
    },
    fetcher,
  );

const pageRow = z.object({
  id: z.string().regex(/^\d{5,30}$/),
  name: z.string().max(200),
  access_token: z.string().min(20).max(1000),
  tasks: z.array(z.string()).optional(),
  instagram_business_account: z
    .object({ id: z.string().regex(/^\d{5,30}$/), username: z.string().max(100).optional() })
    .optional(),
});
const pagesAnswer = z.object({ data: z.array(pageRow) });

export interface PageChoice {
  pageId: string;
  name: string;
  /** The Page access token (sealed before it is stored; never sent to a browser). */
  token: string;
  /** The Page can be posted to: the person has the CREATE_CONTENT task. */
  canPost: boolean;
  instagram: { id: string; username: string } | null;
}

/** The Pages the person manages, with the Instagram professional account connected to each. */
export async function listPages(
  userToken: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<PageChoice[]> {
  const json = await graph(
    {
      base,
      path: 'me/accounts',
      method: 'GET',
      token: userToken,
      tokenIn: 'bearer',
      params: {
        fields: 'id,name,access_token,tasks,instagram_business_account{id,username}',
        limit: 100,
      },
    },
    fetcher,
  );
  const parsed = pagesAnswer.safeParse(json);
  if (!parsed.success)
    throw new SocialApiError('Facebook answered in an unexpected way.', null, 0, false);
  return parsed.data.data.map((p) => ({
    pageId: p.id,
    name: p.name.replace(/[<>]/g, ''),
    token: p.access_token,
    canPost: (p.tasks ?? []).includes('CREATE_CONTENT'),
    instagram: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          username: (p.instagram_business_account.username ?? '').replace(/[<>]/g, ''),
        }
      : null,
  }));
}
