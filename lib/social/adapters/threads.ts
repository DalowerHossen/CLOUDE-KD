// path: lib/social/adapters/threads.ts
// Threads profile posts (host graph.threads.com). Documentation read 2026-10-23: docs/integrations/social.md ("Threads").
// A container is made (form fields), and Meta recommends publishing it about 30 seconds later, so `publish` returns `pending`
// and the cron job calls `finish`.
import 'server-only';
import { THREADS_GRAPH_URL, THREADS_PUBLISH_DELAY_SECONDS } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { graph, idOf } from '../graph';
import { threadsTopicTag } from '../rules';

export const threadsAdapter: SocialAdapter = {
  id: 'threads',
  label: 'Threads',
  async publish(account, post, fetcher) {
    const image = post.imageUrl !== null;
    const topic = threadsTopicTag(post.body);
    const container = idOf(
      await graph(
        {
          base: THREADS_GRAPH_URL,
          path: `${account.externalId}/threads`,
          method: 'POST',
          token: account.token,
          tokenIn: 'body',
          encoding: 'form',
          params: {
            media_type: image ? 'IMAGE' : 'TEXT',
            ...(image && post.imageUrl !== null ? { image_url: post.imageUrl } : {}),
            ...(post.body.trim() !== '' ? { text: post.body } : {}),
            ...(topic !== null ? { topic_tag: topic } : {}),
          },
        },
        fetcher,
      ),
    );
    return {
      state: 'pending',
      containerId: container,
      publishAfterSeconds: THREADS_PUBLISH_DELAY_SECONDS,
    };
  },
  async finish(account, containerId, fetcher) {
    const json = await graph(
      {
        base: THREADS_GRAPH_URL,
        path: `${account.externalId}/threads_publish`,
        method: 'POST',
        token: account.token,
        tokenIn: 'body',
        encoding: 'form',
        params: { creation_id: containerId },
      },
      fetcher,
    );
    return { state: 'published', externalId: idOf(json), url: null };
  },
};
