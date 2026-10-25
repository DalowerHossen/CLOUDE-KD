// path: services/social/meta-connect.ts
// "Connect with Facebook" through the platform's Meta app. The owner logs in at Facebook (the `state` ties the answer to this owner
// and this company), the platform exchanges the code for a long-lived token, reads the Pages the owner manages (and the Instagram
// accounts connected to them) and keeps that list sealed for a few minutes. The owner then picks what to connect; each pick becomes
// a social account that holds the Page token (which does not expire) like an account connected by hand. The user token itself is
// never stored.
import 'server-only';
import {
  CONNECT_MAX_PICKS,
  CONNECT_SESSION_MINUTES,
  META_CALLBACK_PATH,
} from '@/config/s16-social';
import { siteUrl } from '@/lib/cms/site-url';
import { getServerEnv } from '@/lib/env';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import {
  exchangeCode,
  listPages,
  loginUrl,
  longLivedUserToken,
  stateHash,
  type PageChoice,
} from '@/lib/social/meta-oauth';
import type { Fetcher } from '@/lib/social/graph';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { connectAccount } from './accounts';
import { need, open, record, seal } from './db';

export const redirectUri = (): string => `${siteUrl()}${META_CALLBACK_PATH}`;

function creds(): { appId: string; appSecret: string } | null {
  try {
    const env = getServerEnv();
    return env.META_APP_ID && env.META_APP_SECRET
      ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET }
      : null;
  } catch {
    return null;
  }
}

/** The button is shown only when the platform has set its Meta app. */
export const metaLoginAvailable = (): boolean => creds() !== null;

/** Step 1: remember the login (by the hash of its state) and give back the Facebook address to send the owner to. */
export async function startFacebookLogin(actor: Actor): Promise<string> {
  const companyId = need(actor);
  const c = creds();
  if (!c) throw new ConflictError('Connect with Facebook is not set up on this platform yet.');
  const state = randomBase62(40);
  const { error } = await getAdminSupabase()
    .from('social_connect_sessions')
    .insert({
      company_id: companyId,
      user_id: actor.userId,
      state_hash: await stateHash(state),
      expires_at: new Date(Date.now() + CONNECT_SESSION_MINUTES * 60_000).toISOString(),
    });
  if (error) throw new InternalError(error);
  await record(companyId, 'social.facebook_login_started', 'social_connect', null, {});
  return loginUrl(c.appId, redirectUri(), state);
}

/** Step 2: Facebook sent the owner back with a code. Returns the id of the pending choice. */
export async function finishFacebookLogin(
  actor: Actor,
  input: { code: string; state: string },
  fetcher?: Fetcher,
): Promise<string> {
  const companyId = need(actor);
  const c = creds();
  if (!c) throw new ConflictError('Connect with Facebook is not set up on this platform yet.');
  const admin = getAdminSupabase();
  // One use only: the login is claimed by the update, so a repeated or forged call finds nothing.
  const claimed = await admin
    .from('social_connect_sessions')
    .update({ used_at: new Date().toISOString() })
    .eq('state_hash', await stateHash(input.state))
    .eq('company_id', companyId)
    .eq('user_id', actor.userId)
    .is('used_at', null)
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (claimed.error) throw new InternalError(claimed.error);
  if (!claimed.data) throw new NotFoundError();
  const id = String(claimed.data.id);
  const short = await exchangeCode(c, redirectUri(), input.code, fetcher);
  const long = await longLivedUserToken(c, short.access_token, fetcher);
  const pages = await listPages(long.access_token, fetcher);
  const sealed = await seal(companyId, JSON.stringify(pages));
  const saved = await admin
    .from('social_connect_sessions')
    .update({ data_enc: sealed })
    .eq('id', id)
    .eq('company_id', companyId);
  if (saved.error) throw new InternalError(saved.error);
  await record(companyId, 'social.facebook_login_done', 'social_connect', id, {
    pages: pages.length,
  });
  return id;
}

async function load(actor: Actor, id: string): Promise<{ pages: PageChoice[] }> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('social_connect_sessions')
    .select('data_enc, expires_at')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || !data.data_enc || new Date(String(data.expires_at)).getTime() <= Date.now())
    throw new NotFoundError();
  const text = await open(companyId, data.data_enc as EncryptedPayload);
  return { pages: JSON.parse(text) as PageChoice[] };
}

/** What the owner may pick: names only, never a token. */
export interface PickView {
  pageId: string;
  name: string;
  canPost: boolean;
  instagram: { id: string; username: string } | null;
}

export async function pendingChoices(actor: Actor, id: string): Promise<PickView[]> {
  const { pages } = await load(actor, id);
  return pages.map((p) => ({
    pageId: p.pageId,
    name: p.name,
    canPost: p.canPost,
    instagram: p.instagram,
  }));
}

export interface Pick {
  kind: 'facebook' | 'instagram';
  pageId: string;
}

export interface SaveResult {
  connected: string[];
  skipped: { name: string; reason: string }[];
}

/** Step 3: connect the picked Pages and Instagram accounts. A choice can be used once. */
export async function saveChoices(
  actor: Actor,
  id: string,
  picks: readonly Pick[],
): Promise<SaveResult> {
  const companyId = need(actor);
  if (picks.length === 0 || picks.length > CONNECT_MAX_PICKS)
    throw new ValidationError(`Choose between 1 and ${CONNECT_MAX_PICKS} accounts.`);
  const { pages } = await load(actor, id);
  const result: SaveResult = { connected: [], skipped: [] };
  for (const pick of picks) {
    const page = pages.find((p) => p.pageId === pick.pageId);
    if (!page) throw new ValidationError('One of the choices is not on the list.');
    const isInstagram = pick.kind === 'instagram';
    if (isInstagram && !page.instagram) {
      result.skipped.push({
        name: page.name,
        reason: 'No Instagram account is connected to this Page.',
      });
      continue;
    }
    if (!isInstagram && !page.canPost) {
      result.skipped.push({ name: page.name, reason: 'You cannot create posts on this Page.' });
      continue;
    }
    const name = isInstagram ? `@${page.instagram?.username || page.instagram?.id}` : page.name;
    try {
      await connectAccount(actor, {
        provider: isInstagram ? 'instagram' : 'facebook',
        displayName: name,
        externalId: isInstagram ? (page.instagram?.id ?? '') : page.pageId,
        accessToken: page.token,
        tokenExpiresInDays: null,
      });
      result.connected.push(name);
    } catch (error) {
      if (error instanceof ConflictError) {
        result.skipped.push({ name, reason: error.message });
        continue;
      }
      throw error;
    }
  }
  // The list (and the Page tokens in it) is thrown away as soon as it has been used.
  const { error } = await getAdminSupabase()
    .from('social_connect_sessions')
    .update({ data_enc: null, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw new InternalError(error);
  await record(companyId, 'social.facebook_connected', 'social_connect', id, {
    connected: result.connected.length,
    skipped: result.skipped.length,
  });
  return result;
}

/** Cron or page load: pending logins that ran out are removed. */
export async function purgeExpiredConnects(): Promise<void> {
  await getAdminSupabase()
    .from('social_connect_sessions')
    .update({ data_enc: null, deleted_at: new Date().toISOString() })
    .lt('expires_at', new Date().toISOString())
    .is('deleted_at', null);
}
