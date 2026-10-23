// path: lib/social/adapters/pinterest.ts
// Pinterest Pins on one board (host api.pinterest.com). Documentation read 2026-10-23: docs/integrations/social-more.md
// ("Pinterest"). The token is a Pinterest OAuth 2.0 access token (scopes boards:read, pins:read, pins:write, boards:write).
// The account id is the board id. The title is the first line of the text; the whole text is the description.
import 'server-only';
import { PINTEREST_API_URL } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { SocialApiError } from '../graph';
import { request } from '../http';
import { pinTitle } from '../rules';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const pinterestAdapter: SocialAdapter = {
  id: 'pinterest',
  label: 'Pinterest',
  async publish(account, post, fetcher) {
    if (post.imageUrl === null) throw new SocialApiError('A Pin needs an image.', null, 0, false);
    const title = pinTitle(post.body);
    const result = await request(
      {
        url: `${PINTEREST_API_URL}/pins`,
        method: 'POST',
        headers: { authorization: `Bearer ${account.token}` },
        json: {
          board_id: account.externalId,
          media_source: { source_type: 'image_url', url: post.imageUrl },
          ...(title !== '' ? { title } : {}),
          ...(post.body.trim() !== '' ? { description: post.body.trim() } : {}),
          ...(post.linkUrl !== null ? { link: post.linkUrl } : {}),
        },
      },
      fetcher,
    );
    const id = str(result.json.id);
    if (id === '') throw new SocialApiError('The network did not return an id.', null, 200, false);
    return { state: 'published', externalId: id, url: null };
  },
  async check(account, fetcher) {
    const result = await request(
      {
        url: `${PINTEREST_API_URL}/boards/${encodeURIComponent(account.externalId)}`,
        method: 'GET',
        headers: { authorization: `Bearer ${account.token}` },
      },
      fetcher,
    );
    return { name: str(result.json.name).slice(0, 120) };
  },
};
