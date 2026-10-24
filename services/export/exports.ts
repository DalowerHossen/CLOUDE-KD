// path: services/export/exports.ts
// Exports a list as CSV. The file carries a watermark line with the company, the person, the time and an export id,
// so a leaked file can be traced; every export is written to the audit log. At most 10000 rows.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toCsv } from '@/lib/transfer/csv';
import type { ExportRequest } from '@/lib/transfer/mapping';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getImportTarget } from '@/services/import/registry';
import type { Actor } from '@/types/contracts';

export const MAX_EXPORT_ROWS = 10_000;

export interface ExportResult {
  exportId: string;
  fileName: string;
  rowCount: number;
  csv: string;
}

export async function exportList(actor: Actor, input: ExportRequest): Promise<ExportResult> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const target = getImportTarget(input.target);
  const perms = getService('permissions');
  if (
    !(await perms.can(actor, target.readPermission, { type: target.resourceType })) ||
    !(await perms.can(actor, 'list.export', { type: target.resourceType }))
  )
    throw new ForbiddenError();
  const rows = await target.exportRows(companyId, { q: input.q, status: input.status });
  if (rows.length > MAX_EXPORT_ROWS)
    throw new ValidationError(
      'There are more than 10000 rows. Narrow the search and export again.',
    );
  const company = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  const exportId = randomUUID();
  const now = new Date().toISOString();
  const table: string[][] = [
    target.exportColumns.map((c) => c.label),
    ...rows.map((r) => target.exportColumns.map((c) => r[c.key] ?? '')),
    [
      `# KD-EXPORT ${exportId} | ${String(company.data?.name ?? '')} | ${actor.email || actor.userId} | ${now}`,
    ],
  ];
  await getService('audit').record({
    action: 'data.exported',
    resourceType: input.target,
    resourceId: exportId,
    companyId,
    metadata: {
      rows: rows.length,
      by: actor.userId,
      filter: { q: input.q ?? '', status: input.status ?? '' },
    },
  });
  return {
    exportId,
    fileName: `${input.target}-${now.slice(0, 10)}.csv`,
    rowCount: rows.length,
    csv: toCsv(table),
  };
}
