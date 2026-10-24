// path: services/accounting/report-export.ts
// Exports an accounting report as CSV, Excel or PDF through the platform's report file builder. The file carries an export id
// and the name of the person who made it, and every export is written to the audit log.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import type { ReportResult } from '@/lib/reports/types';
import type { Actor } from '@/types/contracts';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import { dayText } from './journal-rules';
import {
  agingTable,
  balanceSheetTable,
  cashBalancesTable,
  cashFlowTable,
  expenseTable,
  expenseTrendTable,
  ledgerTable,
  profitLossTable,
  profitLossTrendTable,
  ratiosTable,
  taxSummaryTable,
  trialBalanceTable,
} from './report-tables';
import {
  apAgingReport,
  arAgingReport,
  balanceSheetReport,
  cashBalanceReport,
  cashFlowReport,
  expenseSummaryReport,
  expenseTrendReport,
  generalLedgerReport,
  profitLossReport,
  profitLossTrendReport,
  ratiosReport,
  taxSummaryReport,
  trialBalanceReport,
  type ReportQuery,
} from './reports';

/** The report as a flat table. */
export async function reportTable(
  companyId: string,
  key: string,
  q: ReportQuery,
): Promise<ReportResult> {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = q.asOf ?? q.to ?? today;
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  for (const d of [q.from, q.to, q.asOf])
    if (d !== undefined && !dayText.safeParse(d).success)
      throw new ValidationError('Use dates like 2026-10-31.');
  switch (key) {
    case 'trial_balance':
      return trialBalanceTable(await trialBalanceReport(companyId, asOf));
    case 'general_ledger':
      return ledgerTable('general_ledger', await generalLedgerReport(companyId, { from, to }));
    case 'account_register':
      if (!q.accountId) throw new ValidationError('Choose an account.');
      return ledgerTable(
        'account_register',
        await generalLedgerReport(companyId, { from, to, accountId: q.accountId }),
      );
    case 'profit_loss':
      return profitLossTable(
        await profitLossReport(
          companyId,
          from,
          to,
          q.compareFrom && q.compareTo ? { from: q.compareFrom, to: q.compareTo } : undefined,
        ),
      );
    case 'profit_loss_trend':
      return profitLossTrendTable(await profitLossTrendReport(companyId, from, to));
    case 'balance_sheet':
      return balanceSheetTable(await balanceSheetReport(companyId, asOf, q.compareTo));
    case 'cash_flow':
      return cashFlowTable(await cashFlowReport(companyId, from, to));
    case 'ar_aging':
      return agingTable('ar_aging', await arAgingReport(companyId, asOf));
    case 'ap_aging':
      return agingTable('ap_aging', await apAgingReport(companyId, asOf));
    case 'cash_balances':
      return cashBalancesTable(await cashBalanceReport(companyId, asOf));
    case 'tax_summary':
      return taxSummaryTable(await taxSummaryReport(companyId, from, to));
    case 'ratios':
      return ratiosTable(await ratiosReport(companyId, from, to));
    case 'expense_summary':
    case 'expense_by_account':
      return expenseTable(key, await expenseSummaryReport(companyId, from, to));
    case 'expense_trend':
      return expenseTrendTable(await expenseTrendReport(companyId, from, to));
    default:
      throw new ValidationError('This report does not exist.');
  }
}

export async function exportAccountingReport(
  actor: Actor,
  key: string,
  q: ReportQuery,
  format: ExportFormat,
): Promise<ReportFile> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'report' })))
    throw new ForbiddenError();
  const table = await reportTable(companyId, key, q);
  const file = await buildReportFile(companyId, table, format, actor.email || actor.userId);
  await getService('audit').record({
    action: 'accounting.report_exported',
    resourceType: 'report',
    resourceId: key,
    companyId,
    metadata: { format, rows: table.rows.length, exportId: file.exportId, by: actor.userId },
  });
  return file;
}
