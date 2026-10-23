// path: app/api/storage/uploads/route.ts
import { withApi } from '@/lib/api/with-api';
import { createSession, createSessionSchema } from '@/services/storage/upload-sessions';

export const POST = withApi(
  {
    id: 'storage.upload.create',
    scope: 'tenant',
    rateLimitPolicy: 'upload',
    body: createSessionSchema,
    auditExempt:
      'Opens an upload session only; the stored file is audited when the upload completes.',
  },
  async ({ body, actor, tenant }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    return { status: 201, data: await createSession(tenant.companyId, actor.userId, body) };
  },
);
