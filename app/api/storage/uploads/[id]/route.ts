// path: app/api/storage/uploads/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { abortSession, loadSession, sessionProgress } from '@/services/storage/upload-sessions';

const params = z.object({ id: z.string().uuid() }).strict();

/** Which chunks the server already has, so an interrupted upload can resume. */
export const GET = withApi(
  { id: 'storage.upload.status', scope: 'tenant', params },
  async ({ params: p, actor, tenant }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    const session = await loadSession(p.id, tenant.companyId, actor.userId);
    return {
      data: {
        ...(await sessionProgress(session)),
        chunkCount: session.chunk_count,
        chunkBytes: session.chunk_bytes,
      },
    };
  },
);

export const DELETE = withApi(
  {
    id: 'storage.upload.abort',
    scope: 'tenant',
    params,
    auditExempt: 'Discards temporary upload data only.',
  },
  async ({ params: p, actor, tenant }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    await abortSession(await loadSession(p.id, tenant.companyId, actor.userId));
    return { data: { aborted: true } };
  },
);
