// path: app/(dashboard)/accounting/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listJournals } from '@/services/accounting/journals';
import { listPostingLog } from '@/services/accounting/posting';
import { cashBalanceReport, profitLossReport } from '@/services/accounting/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accounting' };

interface Figures {
  cash: string;
  revenue: string;
  netIncome: string;
  toReview: number;
  failed: number;
  drafts: number;
}

export default async function AccountingHomePage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'journal_entry');
  const companyId = actor.companyId as string;
  const today = new Date().toISOString().slice(0, 10);
  let figures: Figures | null;
  try {
    const [cash, pl, review, failed, drafts] = await Promise.all([
      cashBalanceReport(companyId, today),
      profitLossReport(companyId, `${today.slice(0, 4)}-01-01`, today),
      listPostingLog(companyId, { review: 'pending', limit: 500 }),
      listPostingLog(companyId, { status: 'failed', limit: 500 }),
      listJournals(companyId, { status: 'draft', limit: 1 }),
    ]);
    figures = {
      cash: cash.total,
      revenue: pl.revenue,
      netIncome: pl.netIncome,
      toReview: review.length,
      failed: failed.length,
      drafts: drafts.total,
    };
  } catch {
    figures = null;
  }
  const links = [
    ['/accounting/journals', t('s15Accounting.nav.journals')],
    ['/accounting/accounts', t('s15Accounting.nav.accounts')],
    ['/accounting/reports', t('s15Accounting.nav.reports')],
    ['/accounting/periods', t('s15Accounting.nav.periods')],
    ['/accounting/recurring', t('s15Accounting.nav.recurring')],
    ['/accounting/review', t('s15Accounting.nav.review')],
  ] as const;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.home.title')}
        description={t('s15Accounting.home.description')}
        actions={
          <Button asChild>
            <Link href="/accounting/journals/new">{t('s15Accounting.journals.new')}</Link>
          </Button>
        }
      />
      {figures === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Accounting.home.currency')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-sp-12 sm:grid-cols-3">
              {(
                [
                  [t('s15Accounting.home.cash'), figures.cash],
                  [t('s15Accounting.home.revenue'), figures.revenue],
                  [t('s15Accounting.home.netIncome'), figures.netIncome],
                  [t('s15Accounting.home.toReview'), String(figures.toReview)],
                  [t('s15Accounting.home.failedPostings'), String(figures.failed)],
                  [t('s15Accounting.home.drafts'), String(figures.drafts)],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
      <ul className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([href, label]) => (
          <li key={href} className="rounded-lg border bg-card p-sp-12">
            <Link className="font-medium underline" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
