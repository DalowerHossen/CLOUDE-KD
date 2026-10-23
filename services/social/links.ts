// path: services/social/links.ts
// Tracked links of social posts. When a post is published, each https address in its text (and its link) is swapped for a short
// address of this platform that counts the click and then forwards to the stored address. The saved post keeps the original text.
// The forwarding route reads the target from the database only, so it cannot be used as an open redirect.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { SOCIAL_LINK_CODE_LENGTH } from '@/config/s16-social';
import { siteUrl } from '@/lib/cms/site-url';
import { InternalError } from '@/lib/errors';
import {
  codeFromBytes,
  isTracked,
  replaceUrls,
  trackedUrl,
  urlsIn,
  LINK_CODE,
} from '@/lib/social/links';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSettings } from './settings';

const MAX_LINKS_PER_POST = 5;

async function codeFor(companyId: string, postId: string, target: string): Promise<string> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('social_links')
    .select('code')
    .eq('post_id', postId)
    .eq('target_url', target)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (found.data) return String(found.data.code);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = codeFromBytes(randomBytes(SOCIAL_LINK_CODE_LENGTH * 3));
    if (code.length !== SOCIAL_LINK_CODE_LENGTH) continue;
    const { error } = await admin
      .from('social_links')
      .insert({ company_id: companyId, post_id: postId, code, target_url: target });
    if (!error) return code;
    if (error.code !== '23505') throw new InternalError(error);
  }
  throw new InternalError(new Error('A link code could not be made.'));
}

/** The text and link of a post as they are sent: addresses replaced by tracked addresses (or unchanged when tracking is off). */
export async function trackLinksIn(
  companyId: string,
  postId: string,
  body: string,
  linkUrl: string | null,
  postWants: boolean,
): Promise<{ body: string; linkUrl: string | null }> {
  if (!postWants || !(await getSettings(companyId)).trackLinks) return { body, linkUrl };
  const origin = siteUrl();
  const targets = [...new Set([...urlsIn(body), ...(linkUrl === null ? [] : [linkUrl])])]
    .filter((u) => !isTracked(u, origin))
    .slice(0, MAX_LINKS_PER_POST);
  if (targets.length === 0) return { body, linkUrl };
  const map = new Map<string, string>();
  for (const t of targets) map.set(t, trackedUrl(origin, await codeFor(companyId, postId, t)));
  return {
    body: replaceUrls(body, map),
    linkUrl: linkUrl === null ? null : (map.get(linkUrl) ?? linkUrl),
  };
}

/** Counts a click and returns where the code leads (null for an unknown code). */
export async function clickThrough(code: string): Promise<string | null> {
  if (!LINK_CODE.test(code)) return null;
  const { data, error } = await getAdminSupabase().rpc('kd_social_click', { p_code: code });
  if (error) throw new InternalError(error);
  return typeof data === 'string' && /^https:\/\//.test(data) ? data : null;
}
