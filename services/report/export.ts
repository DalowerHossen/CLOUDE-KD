// path: services/report/export.ts
// Report files: CSV, Excel and PDF. Every file carries a line with the company, the person, the time and an export id so
// a leaked file can be traced; every export is written to the audit log. Only a person with "report.export" can export.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import { buildXlsx } from '@/lib/export/xlsx';
import { getServerEnv } from '@/lib/env';
import { ReportPdf } from '@/lib/pdf/report-pdf';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import type { ReportParams } from '@/lib/reports/params';
import type { ReportResult } from '@/lib/reports/types';
import { csvOf } from '@/lib/reports/csv';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { runReport } from './reports';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  exportId: string;
}

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function titleLines(
  result: ReportResult,
  company: string,
  who: string,
  exportId: string,
  now: string,
): string[] {
  return [
    `${result.title} - ${company}`,
    result.period ? `Period ${result.period.from} to ${result.period.to}` : 'As of today',
    `KD-EXPORT ${exportId} | ${who} | ${now}`,
  ];
}

/** Makes the file of an already-run report (also used by the schedule job). */
export async function buildReportFile(
  companyId: string,
  result: ReportResult,
  format: ExportFormat,
  who: string,
): Promise<ReportFile> {
  const company = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  const name = String(company.data?.name ?? '');
  const exportId = randomUUID();
  const now = new Date().toISOString();
  const lines = titleLines(result, name, who, exportId, now);
  const base = `${result.key}${result.period ? `-${result.period.from}-${result.period.to}` : `-${now.slice(0, 10)}`}`;
  if (format === 'csv')
    return {
      fileName: `${base}.csv`,
      mimeType: MIME.csv,
      bytes: new TextEncoder().encode(csvOf(result, lines)),
      exportId,
    };
  if (format === 'xlsx')
    return {
      fileName: `${base}.xlsx`,
      mimeType: MIME.xlsx,
      bytes: buildXlsx({
        sheetName: result.title,
        columns: result.columns,
        rows: result.rows,
        totals: result.totals,
        titleLines: lines,
      }),
      exportId,
    };
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const pdf = await renderPdf(
    createElement(ReportPdf, { company: name, generatedOn: now.slice(0, 10), result }),
  );
  return { fileName: `${base}.pdf`, mimeType: MIME.pdf, bytes: pdf.bytes, exportId };
}

export async function exportReport(
  actor: Actor,
  key: string,
  params: ReportParams,
  format: ExportFormat,
): Promise<ReportFile> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  if (!(await getService('permissions').can(actor, 'report.export', { type: 'report' })))
    throw new ForbiddenError();
  const run = await runReport(actor, key, { ...params, compare: false });
  const file = await buildReportFile(
    actor.companyId,
    run.result,
    format,
    actor.email || actor.userId,
  );
  await getService('audit').record({
    action: 'report.exported',
    resourceType: 'report',
    resourceId: key,
    companyId: actor.companyId,
    metadata: { format, rows: run.result.rows.length, exportId: file.exportId, by: actor.userId },
  });
  return file;
}
