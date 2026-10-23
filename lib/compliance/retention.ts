// path: lib/compliance/retention.ts
// Retention runner. STEP 02 data types are handled in SQL (kd_apply_retention_core). Other STEPs register a handler
// for each data type they own (registerRetentionHandler) and add a row to retention_policies in their migration.
import 'server-only';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ component: 'retention' });

export interface RetentionPolicyRow {
  companyId: string | null;
  dataType: string;
  jurisdiction: string;
  retentionDays: number;
  action: 'delete' | 'anonymize' | 'archive';
}

export type RetentionHandler = (policy: RetentionPolicyRow) => Promise<number>;

const handlers = new Map<string, RetentionHandler>();

export function registerRetentionHandler(dataType: string, handler: RetentionHandler): void {
  handlers.set(dataType, handler);
}

const policyRows = z.array(
  z
    .object({
      company_id: z.string().uuid().nullable(),
      data_type: z.string(),
      jurisdiction: z.string(),
      retention_days: z.number().int(),
      action: z.enum(['delete', 'anonymize', 'archive']),
    })
    .strip(),
);

export interface RetentionReport {
  core: Record<string, number>;
  handled: Record<string, number>;
  missingHandlers: string[];
}

export async function runRetention(): Promise<RetentionReport> {
  const admin = getAdminSupabase();
  const core = await admin.rpc('kd_apply_retention_core');
  if (core.error) throw new InternalError(core.error);
  const policies = await admin
    .from('retention_policies')
    .select('company_id, data_type, jurisdiction, retention_days, action')
    .eq('enabled', true)
    .is('deleted_at', null);
  if (policies.error) throw new InternalError(policies.error);
  const report: RetentionReport = {
    core: z.record(z.number()).parse(core.data ?? {}),
    handled: {},
    missingHandlers: [],
  };
  const coreTypes = new Set(Object.keys(report.core));
  for (const row of policyRows.parse(policies.data)) {
    if (coreTypes.has(row.data_type)) continue;
    const handler = handlers.get(row.data_type);
    if (!handler) {
      if (!report.missingHandlers.includes(row.data_type))
        report.missingHandlers.push(row.data_type);
      continue;
    }
    const count = await handler({
      companyId: row.company_id,
      dataType: row.data_type,
      jurisdiction: row.jurisdiction,
      retentionDays: row.retention_days,
      action: row.action,
    });
    report.handled[row.data_type] = (report.handled[row.data_type] ?? 0) + count;
  }
  if (report.missingHandlers.length > 0)
    log.warn('retention policies without handler', { types: report.missingHandlers });
  return report;
}
