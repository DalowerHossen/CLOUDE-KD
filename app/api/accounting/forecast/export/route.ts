// path: app/api/accounting/forecast/export/route.ts
// Plain handler: the cash projection or the revenue and expense forecast as a CSV, Excel or PDF file.
import { z } from 'zod';
import { exportResponse } from '@/services/budget/export-response';
import { reportTable } from '@/services/budget/report-tables';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return exportResponse(request, {
    permission: 'accounting.read',
    resourceType: 'forecast',
    auditAction: 'forecast.report_exported',
    query: z
      .object({ format: z.string().optional(), kind: z.enum(['cash', 'trend']).default('cash') })
      .strip(),
    build: (actor, q) => reportTable(actor, q.kind === 'trend' ? 'trend' : 'cash', {}),
  });
}
