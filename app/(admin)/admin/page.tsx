// path: app/(admin)/admin/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { overview, type Overview } from '@/services/company/admin';
import { homeMetrics, type HomeMetrics } from '@/services/company/admin-metrics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform home' };

function Counter({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string | null;
  href?: string;
}): JSX.Element {
  const body = (
    <div className="rounded-lg border bg-card p-sp-16">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-h3 font-semibold">
        {value === null ? t('s07Company.adminPeople.notAvailable') : value}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

const QUICK_ACTIONS: readonly { href: string; key: string }[] = [
  { href: '/admin/kyc', key: 'qaKyc' },
  { href: '/admin/tenants', key: 'qaTenants' },
  { href: '/admin/users', key: 'qaUsers' },
  { href: '/admin/alerts', key: 'qaAlerts' },
  { href: '/admin/announcements', key: 'qaAnnouncements' },
  { href: '/admin/processors', key: 'qaProcessors' },
  { href: '/admin/plans', key: 'qaPlans' },
  { href: '/admin/setup', key: 'qaSetup' },
];

const usd = (v: string | null): string | null => (v === null ? null : formatMoney(Money.parse(v)));

export default async function AdminHomePage(): Promise<JSX.Element> {
  await requirePagePermission('admin.home', 'platform', 'platform');
  let data: Overview | null;
  try {
    data = await overview();
  } catch {
    data = null;
  }
  const metrics: HomeMetrics | null = await homeMetrics().catch(() => null);
  const p = (k: string): string => t(`s07Company.adminPeople.${k}` as never);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s07Company.adminPeople.homeTitle')}
        description={t('s07Company.adminPeople.homeDescription')}
      />
      {data === null ? (
        <ErrorState description={t('s07Company.adminPeople.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('quickActions')}</h2>
            <div className="flex flex-wrap gap-sp-8 text-sm">
              {QUICK_ACTIONS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="rounded-md border bg-card px-sp-12 py-sp-4 hover:opacity-90"
                >
                  {p(a.key)}
                </Link>
              ))}
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('money')}</h2>
            <div className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-3">
              <Counter label={p('mrr')} value={usd(metrics?.mrr ?? null)} href="/admin/revenue" />
              <Counter label={p('arr')} value={usd(metrics?.arr ?? null)} href="/admin/revenue" />
              <Counter
                label={p('revenueMonth')}
                value={usd(metrics?.revenueMonth ?? null)}
                href="/admin/revenue"
              />
              <Counter
                label={p('revenueYtd')}
                value={usd(metrics?.revenueYtd ?? null)}
                href="/admin/revenue"
              />
              <Counter label={p('invoicesMonth')} value={metrics?.invoicesMonth ?? null} />
              <Counter
                label={p('paymentVolumeMonth')}
                value={usd(metrics?.paymentVolumeMonth ?? null)}
                href="/admin/payments"
              />
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('health')}</h2>
            <div className="rounded-lg border bg-card p-sp-16">
              {metrics?.health ? (
                <>
                  <p className="text-h3 font-semibold">
                    {metrics.health.score} / 100{' '}
                    <span className="text-sm text-muted-foreground">
                      ({p(`health_${metrics.health.level}`)})
                    </span>
                  </p>
                  {metrics.health.reasons.length > 0 ? (
                    <ul className="mt-sp-8 list-disc pl-sp-16 text-sm text-muted-foreground">
                      {metrics.health.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Link className="mt-sp-8 inline-block text-sm underline" href="/admin/health">
                    {p('healthDetails')}
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{p('notAvailable')}</p>
              )}
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('tenants')}</h2>
            <div className="grid gap-sp-12 sm:grid-cols-3">
              <Counter
                label={p('tenantsActive')}
                value={data.tenants.active}
                href="/admin/tenants?status=active"
              />
              <Counter
                label={p('tenantsSuspended')}
                value={data.tenants.suspended}
                href="/admin/tenants?status=suspended"
              />
              <Counter
                label={p('tenantsClosed')}
                value={data.tenants.closed}
                href="/admin/tenants?status=closed"
              />
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('people')}</h2>
            <div className="grid gap-sp-12 sm:grid-cols-3">
              <Counter
                label={p('owners')}
                value={data.users.owners}
                href="/admin/users?role=owner"
              />
              <Counter label={p('staff')} value={data.users.staff} href="/admin/users?role=staff" />
              <Counter
                label={p('platformStaff')}
                value={data.users.platform}
                href="/admin/users?role=platform"
              />
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('queues')}</h2>
            <div className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-4">
              <Counter label={p('kycPending')} value={data.kycPending} href="/admin/kyc" />
              <Counter label={p('alertsOpen')} value={data.alertsOpen} href="/admin/alerts" />
              <Counter
                label={p('incidentsOpen')}
                value={data.incidentsOpen}
                href="/admin/incidents"
              />
              <Counter label={p('ticketsOpen')} value={data.ticketsOpen} />
            </div>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('recent')}</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{p('recentEmpty')}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {data.recent.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="flex justify-between gap-sp-12 p-sp-12">
                    <span className="min-w-0 break-words">
                      {r.action} <span className="text-muted-foreground">({r.resourceType})</span>
                    </span>
                    <time className="shrink-0 text-muted-foreground">
                      {r.at.replace('T', ' ').slice(0, 16)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
