// path: app/(dashboard)/reports/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { reportCatalog, type ReportCategory } from '@/services/report/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports' };

const ORDER: ReportCategory[] = ['sales', 'receivables', 'tax', 'time', 'other'];

export default async function ReportsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('report.read', 'tenant', 'report');
  const perms = getService('permissions');
  const visible = (
    await Promise.all(
      reportCatalog().map(async (d) => ({
        d,
        ok: !d.extraPermission || (await perms.can(actor, d.extraPermission, { type: 'report' })),
      })),
    )
  )
    .filter((x) => x.ok)
    .map((x) => x.d);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s09Reports.title')} description={t('s09Reports.description')} />
      {visible.length === 0 ? (
        <EmptyState title={t('s09Reports.empty')} />
      ) : (
        ORDER.map((cat) => {
          const list = visible.filter((d) => d.category === cat);
          if (list.length === 0) return null;
          return (
            <section key={cat} className="space-y-sp-8">
              <h2 className="text-lg font-semibold">
                {t(`s09Reports.categories.${cat}` as StringKey)}
              </h2>
              <ul className="grid gap-sp-12 sm:grid-cols-2">
                {list.map((d) => (
                  <li key={d.key} className="rounded-lg border bg-card p-sp-12 text-sm">
                    <Link className="font-medium underline" href={`/reports/${d.key}`}>
                      {d.title}
                    </Link>
                    <p className="text-muted-foreground">{d.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
