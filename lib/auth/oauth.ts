// path: lib/auth/oauth.ts
// OAuth 2.0 helpers for sign-in with Google and GitHub: provider table, PKCE and authorize URL. Pure functions.
import { base64UrlEncode, randomBase64Url, sha256Bytes } from '@/lib/utils/hash';

export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export interface ProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  label: string;
}

export const PROVIDER_ENDPOINTS: Readonly<Record<OAuthProvider, ProviderEndpoints>> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    label: 'Google',
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    label: 'GitHub',
  },
};

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** PKCE (RFC 7636) with the S256 method. */
export async function createPkce(): Promise<Pkce> {
  const verifier = randomBase64Url(48);
  return { verifier, challenge: base64UrlEncode(await sha256Bytes(verifier)) };
}

export function createState(): string {
  return randomBase64Url(32);
}

export function redirectUri(appUrl: string, provider: OAuthProvider): string {
  return `${appUrl.replace(/\/+$/, '')}/oauth/callback/${provider}`;
}

export function buildAuthorizeUrl(input: {
  provider: OAuthProvider;
  clientId: string;
  redirect: string;
  state: string;
  challenge: string;
}): string {
  const endpoints = PROVIDER_ENDPOINTS[input.provider];
  const url = new URL(endpoints.authorizeUrl);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', endpoints.scope);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.provider === 'google') url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/** The client may only navigate to these hosts after the start call. */
export function isAllowedAuthorizeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'accounts.google.com' || host === 'github.com';
  } catch {
    return false;
  }
}
