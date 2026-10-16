// path: app/(admin)/admin/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { overview, type Overview } from '@/services/company/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform home' };

function Counter({
  label,
  value,
  href,
}: {
  label: string;
  value: number | null;
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

export default async function AdminHomePage(): Promise<JSX.Element> {
  await requirePagePermission('admin.home', 'platform', 'platform');
  let data: Overview | null;
  try {
    data = await overview();
  } catch {
    data = null;
  }
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
