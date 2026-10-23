// path: app/api/storage/uploads/[id]/complete/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { loadSession, takeAssembledFile, finishSession } from '@/services/storage/upload-sessions';
import { putFile } from '@/services/storage/storage-core';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'storage.upload.complete',
    scope: 'tenant',
    rateLimitPolicy: 'upload',
    params,
    auditExempt: 'The storage service writes the audit entry for the stored file.',
  },
  async ({ params: p, actor, tenant }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    await loadSession(p.id, tenant.companyId, actor.userId);
    const { session, bytes } = await takeAssembledFile(p.id, actor.userId);
    try {
      const record = await putFile({
        companyId: tenant.companyId,
        category: session.category as Parameters<typeof putFile>[0]['category'],
        name: session.name,
        bytes,
        mimeType: session.declared_mime ?? 'application/octet-stream',
        clientHash: session.expected_hash,
      });
      await finishSession(session.id, record.id, true);
      return { status: 201, data: record };
    } catch (error) {
      await finishSession(session.id, null, false);
      throw error;
    }
  },
);
