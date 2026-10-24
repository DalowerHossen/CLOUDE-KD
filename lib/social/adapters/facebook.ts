// path: lib/social/adapters/facebook.ts
// Facebook Page posts. Documentation read 2026-10-23: docs/integrations/social.md ("Facebook Page post").
import 'server-only';
import { FACEBOOK_API_VERSION, FACEBOOK_GRAPH_URL } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { graph, idOf } from '../graph';
import { facebookPostUrl } from '../rules';

const base = `${FACEBOOK_GRAPH_URL}/${FACEBOOK_API_VERSION}`;

export const facebookAdapter: SocialAdapter = {
  id: 'facebook',
  label: 'Facebook',
  async publish(account, post, fetcher) {
    if (post.imageUrl !== null) {
      // A photo: POST /{page-id}/photos with the url of the photo; the caption is the message.
      const json = await graph(
        {
          base,
          path: `${account.externalId}/photos`,
          method: 'POST',
          token: account.token,
          tokenIn: 'body',
          params: {
            url: post.imageUrl,
            ...(post.body.trim() !== '' ? { message: post.body } : {}),
          },
        },
        fetcher,
      );
      const postId =
        typeof json.post_id === 'string' && json.post_id !== '' ? json.post_id : idOf(json);
      return { state: 'published', externalId: postId, url: facebookPostUrl(postId) };
    }
    const json = await graph(
      {
        base,
        path: `${account.externalId}/feed`,
        method: 'POST',
        token: account.token,
        tokenIn: 'body',
        params: { message: post.body, ...(post.linkUrl !== null ? { link: post.linkUrl } : {}) },
      },
      fetcher,
    );
    const id = idOf(json);
    return { state: 'published', externalId: id, url: facebookPostUrl(id) };
  },
  async check(account, fetcher) {
    const json = await graph(
      {
        base,
        path: account.externalId,
        method: 'GET',
        token: account.token,
        tokenIn: 'bearer',
        params: { fields: 'name' },
      },
      fetcher,
    );
    return { name: typeof json.name === 'string' ? json.name.slice(0, 120) : '' };
  },
};
