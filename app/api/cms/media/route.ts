// path: app/api/cms/media/route.ts
import { withApi } from '@/lib/api/with-api';
import { listMedia, uploadMedia, uploadSchema } from '@/services/cms/media';

const permission = { action: 'cms.edit', resourceType: 'cms' } as const;

export const GET = withApi(
  { id: 'cms.media.list', scope: 'platform', networkContext: 'admin', permission },
  async () => ({ data: await listMedia() }),
);

export const POST = withApi(
  {
    id: 'cms.media.upload',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    rateLimitPolicy: 'upload',
    maxBodyBytes: 5_000_000,
    body: uploadSchema,
    auditExempt: 'The storage service writes the audit entry for the stored file.',
  },
  async ({ body }) => ({ status: 201, data: await uploadMedia(body) }),
);
