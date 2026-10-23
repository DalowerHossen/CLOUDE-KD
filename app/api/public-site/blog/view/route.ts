// path: app/api/public-site/blog/view/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { slugSchema } from '@/services/blog/schemas';
import { countView } from '@/services/blog/public';

export const POST = withApi(
  {
    id: 'public.blog.view',
    scope: 'public',
    body: z.object({ slug: slugSchema }).strict(),
    auditExempt: 'Only a counter changes; no visitor data is stored.',
  },
  async ({ body }) => {
    await countView(body.slug);
    return { status: 202, data: { counted: true } };
  },
);
