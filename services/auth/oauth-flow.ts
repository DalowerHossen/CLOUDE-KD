// path: services/auth/oauth-flow.ts
// Sign-in and account linking with Google and GitHub. State and PKCE protect the code exchange. An existing account
// is never linked silently: linking needs the signed-in owner of that account.
import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  buildAuthorizeUrl,
  createPkce,
  createState,
  isOAuthProvider,
  PROVIDER_ENDPOINTS,
  redirectUri,
  type OAuthProvider,
} from '@/lib/auth/oauth';
import { cookieSecure } from '@/lib/auth/session';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomBase64Url, randomHex, timingSafeEqualStrings } from '@/lib/utils/hash';
import { slugify } from '@/lib/utils/slug';
import { assertStepUp } from '@/lib/auth/step-up';
import { currentActor } from './actor';
import { lookupUserByEmail, lookupUserById, pepper } from './credentials';
import { finishPrimaryAuth, GENERIC_LOGIN_MESSAGE, type LoginOutcome } from './login-flow';
import { checkLock, hashIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';

const log = createLogger({ component: 'oauth' });
const COOKIE = 'kd_oauth';
const TTL_SECONDS = 600;

export const providerParamSchema = z
  .object({ provider: z.string().refine(isOAuthProvider) })
  .strict();
export const startSchema = z.object({ mode: z.enum(['login', 'link']).default('login') }).strict();
export const callbackSchema = z
  .object({ code: z.string().min(1).max(2048), state: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) })
  .strict();
export const unlinkSchema = z.object({ provider: z.string().refine(isOAuthProvider) }).strict();

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function credentials(provider: OAuthProvider): Credentials | null {
  const env = getServerEnv();
  if (provider === 'google') {
    return env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
      ? { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET }
      : null;
  }
  return env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
    ? { clientId: env.GITHUB_OAUTH_CLIENT_ID, clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET }
    : null;
}

/** A provider is offered when its credentials are set and the global flag `auth.oauth.<provider>` is not switched off. */
export async function providerEnabled(provider: OAuthProvider): Promise<boolean> {
  if (!credentials(provider)) return false;
  const { data, error } = await getAdminSupabase()
    .from('feature_flags')
    .select('enabled')
    .eq('key', `auth.oauth.${provider}`)
    .is('company_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data === null || data.enabled === true;
}

export async function enabledProviders(): Promise<OAuthProvider[]> {
  const out: OAuthProvider[] = [];
  for (const p of ['google', 'github'] as const) if (await providerEnabled(p)) out.push(p);
  return out;
}

const key = (): Uint8Array => new TextEncoder().encode(`oauth-state:${pepper()}`);

const cookieSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  provider: z.string().refine(isOAuthProvider),
  mode: z.enum(['login', 'link']),
  uid: z.string().uuid().nullable(),
});

export async function startOAuth(
  provider: OAuthProvider,
  mode: 'login' | 'link',
): Promise<{ url: string }> {
  const creds = credentials(provider);
  if (!creds || !(await providerEnabled(provider))) throw new NotFoundError();
  let uid: string | null = null;
  if (mode === 'link') {
    const actor = await currentActor();
    if (!actor) throw new UnauthorizedError();
    uid = actor.userId;
  }
  const state = createState();
  const pkce = await createPkce();
  const token = await new SignJWT({ state, verifier: pkce.verifier, provider, mode, uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/api/auth/oauth',
    maxAge: TTL_SECONDS,
  });
  return {
    url: buildAuthorizeUrl({
      provider,
      clientId: creds.clientId,
      redirect: redirectUri(getPublicEnv().NEXT_PUBLIC_APP_URL, provider),
      state,
      challenge: pkce.challenge,
    }),
  };
}

const tokenResponse = z.object({ access_token: z.string().min(1) }).passthrough();

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

interface ProviderProfile {
  subject: string;
  email: string;
  name: string;
  accessToken: string;
}

async function exchangeAndProfile(
  provider: OAuthProvider,
  code: string,
  verifier: string,
): Promise<ProviderProfile> {
  const creds = credentials(provider);
  if (!creds) throw new NotFoundError();
  const endpoints = PROVIDER_ENDPOINTS[provider];
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: redirectUri(getPublicEnv().NEXT_PUBLIC_APP_URL, provider),
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const token = tokenResponse.parse(
    await fetchJson(endpoints.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    }),
  );
  const auth = { authorization: `Bearer ${token.access_token}`, accept: 'application/json' };
  if (provider === 'google') {
    const info = z
      .object({
        sub: z.string(),
        email: z.string().email(),
        email_verified: z.boolean(),
        name: z.string().optional(),
      })
      .parse(
        await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', { headers: auth }),
      );
    if (!info.email_verified) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
    return {
      subject: info.sub,
      email: info.email.toLowerCase(),
      name: info.name ?? '',
      accessToken: token.access_token,
    };
  }
  const gh = { ...auth, 'user-agent': 'kd-solution-it' };
  const user = z
    .object({ id: z.number(), name: z.string().nullable().optional(), login: z.string() })
    .parse(await fetchJson('https://api.github.com/user', { headers: gh }));
  const emails = z
    .array(z.object({ email: z.string().email(), primary: z.boolean(), verified: z.boolean() }))
    .parse(await fetchJson('https://api.github.com/user/emails', { headers: gh }));
  const primary = emails.find((e) => e.primary && e.verified);
  if (!primary) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  return {
    subject: String(user.id),
    email: primary.email.toLowerCase(),
    name: user.name ?? user.login,
    accessToken: token.access_token,
  };
}

async function storeIdentity(
  userId: string,
  companyId: string | null,
  provider: OAuthProvider,
  profile: ProviderProfile,
): Promise<void> {
  const encrypted = await getService('encryption').encrypt(
    'oauth-tokens',
    JSON.stringify({ access_token: profile.accessToken }),
    userId,
  );
  const admin = getAdminSupabase();
  const existing = await admin
    .from('oauth_identities')
    .select('id')
    .eq('provider', provider)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const result = existing.data
    ? await admin
        .from('oauth_identities')
        .update({ provider_subject: profile.subject, tokens_encrypted: encrypted })
        .eq('id', existing.data.id)
    : await admin.from('oauth_identities').insert({
        user_id: userId,
        company_id: companyId,
        provider,
        provider_subject: profile.subject,
        tokens_encrypted: encrypted,
      });
  if (result.error) throw new InternalError(result.error);
}

export type OAuthOutcome = LoginOutcome | { status: 'linked' } | { status: 'link_required' };

export async function completeOAuth(
  provider: OAuthProvider,
  input: z.infer<typeof callbackSchema>,
): Promise<OAuthOutcome> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  store.delete({ name: COOKIE, path: '/api/auth/oauth' });
  if (!raw) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  let saved: z.infer<typeof cookieSchema>;
  try {
    saved = cookieSchema.parse((await jwtVerify(raw, key(), { algorithms: ['HS256'] })).payload);
  } catch {
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  if (saved.provider !== provider || !timingSafeEqualStrings(saved.state, input.state)) {
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  let profile: ProviderProfile;
  try {
    profile = await exchangeAndProfile(provider, input.code, saved.verifier);
  } catch (error) {
    log.warn('oauth exchange failed', { provider, error });
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  const admin = getAdminSupabase();
  const identity = await admin
    .from('oauth_identities')
    .select('user_id')
    .eq('provider', provider)
    .eq('provider_subject', profile.subject)
    .is('deleted_at', null)
    .maybeSingle();
  if (identity.error) throw new InternalError(identity.error);

  if (saved.mode === 'link') {
    const actor = await currentActor();
    if (!actor || actor.userId !== saved.uid) throw new UnauthorizedError();
    if (identity.data && identity.data.user_id !== actor.userId)
      throw new ValidationError('This account is already linked to another user.');
    await storeIdentity(actor.userId, actor.companyId, provider, profile);
    await getService('audit').record({
      action: 'auth.oauth_linked',
      resourceType: 'user',
      resourceId: actor.userId,
      metadata: { provider },
    });
    return { status: 'linked' };
  }

  if (identity.data) {
    const user = await lookupUserById(String(identity.data.user_id));
    if (!user || !user.active) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
    const identifier = await hashIdentifier(user.email);
    if ((await checkLock(identifier)).locked) {
      await recordLoginEvent({
        identifierHash: identifier,
        type: 'blocked_while_locked',
        userId: user.userId,
      });
      throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
    }
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'oauth_login',
      userId: user.userId,
      companyId: user.companyId,
      detail: { provider },
    });
    return finishPrimaryAuth({ user, email: user.email, identifier, rememberMe: false });
  }

  if (await lookupUserByEmail(profile.email)) return { status: 'link_required' };

  // First sign-in with this provider and no account for the address: create the account and a company workspace.
  const created = await admin.auth.admin.createUser({
    email: profile.email,
    email_confirm: true,
    password: randomBase64Url(36),
  });
  if (created.error || !created.data.user) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  const userId = created.data.user.id;
  try {
    const company = await admin
      .from('companies')
      .insert({
        name: `${profile.name || 'My'} company`.slice(0, 200),
        slug: `${slugify(profile.name || 'company', 50) || 'company'}-${randomHex(3)}`,
      })
      .select('id')
      .single();
    if (company.error) throw new InternalError(company.error);
    const companyId = String(company.data.id);
    const profileRow = await admin.from('profiles').insert({
      company_id: companyId,
      user_id: userId,
      email: profile.email,
      full_name: profile.name.slice(0, 200),
    });
    if (profileRow.error) throw new InternalError(profileRow.error);
    const membership = await admin
      .from('memberships')
      .insert({ company_id: companyId, user_id: userId, role: 'owner' });
    if (membership.error) throw new InternalError(membership.error);
    const meta = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { company_id: companyId, role: 'owner' },
    });
    if (meta.error) throw new InternalError(meta.error);
    await storeIdentity(userId, companyId, provider, profile);
    await getService('audit').record({
      action: 'auth.signup',
      resourceType: 'user',
      resourceId: userId,
      companyId,
      metadata: { method: provider },
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }
  const user = await lookupUserByEmail(profile.email);
  if (!user) throw new InternalError();
  const identifier = await hashIdentifier(profile.email);
  await recordLoginEvent({
    identifierHash: identifier,
    type: 'signup',
    userId,
    companyId: user.companyId,
    detail: { provider },
  });
  return finishPrimaryAuth({ user, email: profile.email, identifier, rememberMe: false });
}

export async function unlinkProvider(provider: OAuthProvider): Promise<void> {
  const actor = await currentActor();
  if (!actor) throw new UnauthorizedError();
  assertStepUp(actor);
  const { error } = await getAdminSupabase()
    .from('oauth_identities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', actor.userId)
    .eq('provider', provider)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'auth.oauth_unlinked',
    resourceType: 'user',
    resourceId: actor.userId,
    metadata: { provider },
  });
}
