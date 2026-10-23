// path: app/api/blog/posts/route.ts
import { withApi } from '@/lib/api/with-api';
import { listPosts, taxonomy } from '@/services/blog/admin';

export const GET = withApi(
  {
    id: 'blog.posts.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'blog.read', resourceType: 'blog' },
  },
  async () => ({ data: { posts: await listPosts(), taxonomy: await taxonomy() } }),
);
