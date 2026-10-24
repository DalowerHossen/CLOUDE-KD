// path: app/api/storage/files/[id]/signed-url/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { createSignedUrl } from '@/services/storage/signed-urls';

export const POST = withApi(
  {
    id: 'storage.file.signed_url',
    scope: 'tenant',
    rateLimitPolicy: 'download',
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z
      .object({
        ttlSeconds: z.number().int().min(30).max(3600).default(600),
        inline: z.boolean().default(false),
      })
      .strict(),
    auditExempt: 'Every link is written to the file access log.',
  },
  async ({ params, body }) => ({
    data: {
      url: await createSignedUrl(params.id, body.ttlSeconds, { inline: body.inline }),
      expiresInSeconds: body.ttlSeconds,
    },
  }),
);
