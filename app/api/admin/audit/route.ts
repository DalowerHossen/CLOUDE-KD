// path: app/api/admin/audit/route.ts
import { withApi } from '@/lib/api/with-api';
import { createServerSupabase } from '@/lib/supabase/server';
import { auditSearchSchema, searchAudit } from '@/services/audit/search';

export const GET = withApi(
  {
    id: 'admin.audit.search',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'audit.read', resourceType: 'audit_log' },
    query: auditSearchSchema,
  },
  async ({ query }) => ({ data: await searchAudit(await createServerSupabase(), query) }),
);
