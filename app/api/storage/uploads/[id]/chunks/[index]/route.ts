// path: app/api/storage/uploads/[id]/chunks/[index]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { loadSession, putChunk } from '@/services/storage/upload-sessions';

const params = z
  .object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(159) })
  .strict();
const body = z
  .object({
    data: z
      .string()
      .min(4)
      .max(1_600_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const PUT = withApi(
  {
    id: 'storage.upload.chunk',
    scope: 'tenant',
    rateLimitPolicy: 'upload',
    params,
    body,
    maxBodyBytes: 1_700_000,
    auditExempt: 'Temporary upload data only.',
  },
  async ({ params: p, body: b, actor, tenant }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    const session = await loadSession(p.id, tenant.companyId, actor.userId);
    const bytes = Buffer.from(b.data, 'base64');
    if (bytes.length === 0) throw new ValidationError('The chunk is empty.');
    return { data: { received: await putChunk(session, p.index, bytes) } };
  },
);
