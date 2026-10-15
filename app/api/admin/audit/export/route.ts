// path: app/api/admin/audit/export/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { AUDIT_EXPORT_CONTENT_TYPES, formatAuditExport } from '@/lib/compliance/audit-export';
import { createServerSupabase } from '@/lib/supabase/server';
import { auditSearchSchema, searchAudit } from '@/services/audit/search';

const exportQuery = auditSearchSchema
  .omit({ cursor: true, limit: true })
  .extend({ format: z.enum(['json', 'csv', 'cef']).default('csv') })
  .strict();

const EXPORT_LIMIT = 200;

export const GET = withApi(
  {
    id: 'admin.audit.export',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'audit.export', resourceType: 'audit_log' },
    stepUp: { maxAgeSeconds: 600 },
    query: exportQuery,
  },
  async ({ query }) => {
    const { format, ...filter } = query;
    const page = await searchAudit(await createServerSupabase(), { ...filter, cursor: null, limit: EXPORT_LIMIT });
    return {
      data: {
        format,
        contentType: AUDIT_EXPORT_CONTENT_TYPES[format],
        rowCount: page.items.length,
        truncated: page.nextCursor !== null,
        content: formatAuditExport(page.items, format),
      },
    };
  },
);
