// path: app/(dashboard)/accounting/reports/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { REPORT_CATALOG } from '@/config/s15-accounting';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Financial reports' };

export default async function AccountingReportsPage(): Promise<JSX.Element> {
  await requirePagePermission('accounting.read', 'tenant', 'report');
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s15Accounting.reports.title')}
        description={t('s15Accounting.reports.description')}
      />
      <ul className="grid gap-sp-12 sm:grid-cols-2">
        {REPORT_CATALOG.map((r) => (
          <li key={r.key} className="rounded-lg border bg-card p-sp-12 text-sm">
            <Link className="font-medium underline" href={`/accounting/reports/${r.key}`}>
              {r.title}
            </Link>
            <p className="text-muted-foreground">{r.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
