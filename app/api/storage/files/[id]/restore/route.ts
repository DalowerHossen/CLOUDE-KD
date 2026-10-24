// path: app/api/storage/files/[id]/restore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { restoreFile } from '@/services/storage/storage-core';

export const POST = withApi(
  {
    id: 'storage.file.restore',
    scope: 'tenant',
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The storage service writes the audit entry.',
  },
  async ({ params }) => ({ data: await restoreFile(params.id) }),
);
