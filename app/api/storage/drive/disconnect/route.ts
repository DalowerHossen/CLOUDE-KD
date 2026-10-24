// path: app/api/storage/drive/disconnect/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { disconnectDrive } from '@/services/storage/drive-link';

export const POST = withApi(
  {
    id: 'storage.drive.disconnect',
    scope: 'tenant',
    permission: { action: 'storage.manage', resourceType: 'storage' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: z.object({ force: z.boolean().default(false) }).strict(),
    auditExempt: 'The Drive link service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new Error('unreachable');
    await disconnectDrive(actor, body.force);
    return { data: { disconnected: true } };
  },
);
