// path: lib/social/adapters/x.ts
// X posts (host api.x.com). Documentation read 2026-10-23: docs/integrations/social-more.md ("X").
// The token is the OAuth 2.0 user access token of the account (scopes tweet.read, tweet.write, users.read). Text and a link are
// sent; images need the media upload flow, which is not built.
import 'server-only';
import { X_API_URL } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { SocialApiError } from '../graph';
import { request } from '../http';
import { textWithLink } from '../rules';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export const xAdapter: SocialAdapter = {
  id: 'x',
  label: 'X',
  async publish(account, post, fetcher) {
    const result = await request(
      {
        url: `${X_API_URL}/tweets`,
        method: 'POST',
        headers: { authorization: `Bearer ${account.token}` },
        json: { text: textWithLink(post) },
      },
      fetcher,
    );
    const id = str(obj(result.json.data).id);
    if (id === '') throw new SocialApiError('The network did not return an id.', null, 200, false);
    return { state: 'published', externalId: id, url: null };
  },
  async check(account, fetcher) {
    const result = await request(
      {
        url: `${X_API_URL}/users/me`,
        method: 'GET',
        headers: { authorization: `Bearer ${account.token}` },
      },
      fetcher,
    );
    const me = obj(result.json.data);
    if (str(me.id) !== account.externalId)
      throw new SocialApiError('The token belongs to another X account.', null, 200, false);
    return { name: str(me.username).slice(0, 120) };
  },
};
