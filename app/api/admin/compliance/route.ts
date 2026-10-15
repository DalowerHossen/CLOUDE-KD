// path: app/api/admin/compliance/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { listDsar } from '@/services/compliance/dsar';
import { listClassifications, listRetention } from '@/services/compliance/queries';

const query = z.object({ kind: z.enum(['dsar', 'retention', 'classification']) }).strict();

export const GET = withApi(
  {
    id: 'admin.compliance.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.read', resourceType: 'compliance' },
    query,
  },
  async ({ query: { kind } }): Promise<{ data: { items: readonly unknown[] } }> => {
    if (kind === 'dsar') return { data: { items: await listDsar() } };
    if (kind === 'retention') return { data: { items: await listRetention() } };
    return { data: { items: await listClassifications() } };
  },
);
