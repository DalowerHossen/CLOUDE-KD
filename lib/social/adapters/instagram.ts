// path: lib/social/adapters/instagram.ts
// Instagram professional account posts (API with Facebook Login, host graph.facebook.com). Documentation read 2026-10-23:
// docs/integrations/social.md ("Instagram"). A container is made with the image address and caption, its status is read until it
// is FINISHED, and then it is published.
import 'server-only';
import {
  FACEBOOK_API_VERSION,
  FACEBOOK_GRAPH_URL,
  IG_STATUS_POLLS,
  IG_STATUS_POLL_MS,
} from '@/config/s16-social';
import type { AdapterAccount, PublishedPost, SocialAdapter } from '../adapter';
import { graph, idOf, SocialApiError, type Fetcher } from '../graph';

const base = `${FACEBOOK_GRAPH_URL}/${FACEBOOK_API_VERSION}`;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function finishContainer(
  account: AdapterAccount,
  containerId: string,
  fetcher?: Fetcher,
): Promise<PublishedPost> {
  const status = await graph(
    {
      base,
      path: containerId,
      method: 'GET',
      token: account.token,
      tokenIn: 'bearer',
      params: { fields: 'status_code' },
    },
    fetcher,
  );
  const code = typeof status.status_code === 'string' ? status.status_code : '';
  if (code === 'ERROR' || code === 'EXPIRED')
    throw new SocialApiError('Instagram could not process the image.', null, 0, false);
  if (code === 'IN_PROGRESS')
    throw new SocialApiError('Instagram is still processing the image.', null, 0, true);
  const published = await graph(
    {
      base,
      path: `${account.externalId}/media_publish`,
      method: 'POST',
      token: account.token,
      tokenIn: 'bearer',
      params: { creation_id: containerId },
    },
    fetcher,
  );
  return { state: 'published', externalId: idOf(published), url: null };
}

export const instagramAdapter: SocialAdapter = {
  id: 'instagram',
  label: 'Instagram',
  async publish(account, post, fetcher) {
    if (post.imageUrl === null)
      throw new SocialApiError('Instagram needs an image.', null, 0, false);
    const container = idOf(
      await graph(
        {
          base,
          path: `${account.externalId}/media`,
          method: 'POST',
          token: account.token,
          tokenIn: 'bearer',
          params: {
            image_url: post.imageUrl,
            ...(post.body.trim() !== '' ? { caption: post.body } : {}),
          },
        },
        fetcher,
      ),
    );
    // The status is read a few times; a container that is still in progress is tried again later by the caller.
    for (let i = 0; i < IG_STATUS_POLLS; i += 1) {
      const status = await graph(
        {
          base,
          path: container,
          method: 'GET',
          token: account.token,
          tokenIn: 'bearer',
          params: { fields: 'status_code' },
        },
        fetcher,
      );
      const code = typeof status.status_code === 'string' ? status.status_code : '';
      if (code === 'FINISHED') return finishContainer(account, container, fetcher);
      if (code === 'ERROR' || code === 'EXPIRED')
        throw new SocialApiError('Instagram could not process the image.', null, 0, false);
      if (i < IG_STATUS_POLLS - 1) await wait(IG_STATUS_POLL_MS);
    }
    return { state: 'pending', containerId: container, publishAfterSeconds: 60 };
  },
  finish: (account, containerId, fetcher) => finishContainer(account, containerId, fetcher),
  async check(account, fetcher) {
    const json = await graph(
      {
        base,
        path: account.externalId,
        method: 'GET',
        token: account.token,
        tokenIn: 'bearer',
        params: { fields: 'username' },
      },
      fetcher,
    );
    return { name: typeof json.username === 'string' ? json.username.slice(0, 120) : '' };
  },
};
