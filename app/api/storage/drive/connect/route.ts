// path: app/api/storage/drive/connect/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { startDriveLink } from '@/services/storage/drive-link';

export const POST = withApi(
  {
    id: 'storage.drive.connect',
    scope: 'tenant',
    permission: { action: 'storage.manage', resourceType: 'storage' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: z.object({}).strict(),
    auditExempt:
      'Only builds the Google sign-in address; the link itself is audited when it is completed.',
  },
  async ({ actor }) => {
    if (!actor) throw new Error('unreachable');
    return { data: await startDriveLink(actor) };
  },
);
