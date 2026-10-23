// path: app/api/hr/performance/export/route.ts
// Plain handler: the performance table of a period as a CSV, Excel or PDF file (audited).
import { z } from 'zod';
import { dayText } from '@/services/accounting/journal-rules';
import { exportResponse } from '@/services/budget/export-response';
import { performanceTable } from '@/services/hr/performance';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return exportResponse(request, {
    permission: 'hr.performance.read',
    resourceType: 'employee',
    auditAction: 'hr.performance_exported',
    query: z.object({ format: z.string().optional(), from: dayText, to: dayText }).strip(),
    build: (actor, q) => performanceTable(actor, q.from as string, q.to as string),
  });
}
