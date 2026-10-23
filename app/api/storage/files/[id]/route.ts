// path: app/api/storage/files/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { assertCanAccess, currentActorOrNull, loadFile, toRecord } from '@/services/storage/files';
import { removeFile } from '@/services/storage/storage-core';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  { id: 'storage.file.read', scope: 'tenant', params },
  async ({ params: p }) => {
    const row = await loadFile(p.id);
    await assertCanAccess(row, await currentActorOrNull());
    return { data: toRecord(row) };
  },
);

export const DELETE = withApi(
  {
    id: 'storage.file.delete',
    scope: 'tenant',
    params,
    auditExempt: 'The storage service writes the audit entry.',
  },
  async ({ params: p }) => {
    await removeFile(p.id);
    return { data: { trashed: true } };
  },
);
