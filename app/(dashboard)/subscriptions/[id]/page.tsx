// path: app/(dashboard)/subscriptions/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listClientPlans, type ClientPlanView } from '@/services/subscription/client-plans';
import {
  clientSubEvents,
  listClientSubs,
  loadClientSub,
  toClientSubView,
  type ClientSubView,
} from '@/services/subscription/client-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client subscription' };

export default async function ClientSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'client_subscription.read',
    'tenant',
    'client_subscription',
  );
  const companyId = actor.companyId as string;
  const { id } = await params;
  const canManage = await getService('permissions').can(actor, 'client_subscription.manage', {
    type: 'client_subscription',
  });
  let sub: ClientSubView | null = null;
  let label = '';
  let plans: ClientPlanView[] = [];
  let history: Awaited<ReturnType<typeof clientSubEvents>> = [];
  try {
    sub = toClientSubView(await loadClientSub(companyId, id));
    const [named, list, events] = await Promise.all([
      listClientSubs(companyId, { clientId: sub.clientId }),
      listClientPlans(companyId),
      clientSubEvents(companyId, id),
    ]);
    const me = named.find((x) => x.id === id);
    label = me ? `${me.clientName} - ${me.planName}` : id;
    plans = list;
    history = events;
  } catch (thrown) {
    if (thrown instanceof NotFoundError) notFound();
    sub = null;
  }
  if (!sub) return <ErrorState description={t('s14Wallet.common.loadError')} />;
  const live = ['trialing', 'active', 'past_due', 'paused'].includes(sub.status);
  return (
    <div className="space-y-sp-24">
      <PageHeader title={label} description={t('s14Wallet.clientSubs.pageDescription')} />
      <Card>
        <CardContent className="space-y-sp-8 pt-sp-16">
          <p>
            <Badge variant="outline">
              {t(`s14Wallet.clientSubs.statuses.${sub.status}` as StringKey)}
            </Badge>{' '}
            {sub.cycleAmount} USD ({t(`s14Wallet.clientSubs.interval.${sub.interval}` as StringKey)}
            ), {sub.seats} {t('s14Wallet.clientSubs.seats')}
          </p>
          <p className="text-sm text-muted-foreground">
            {sub.trialEndsAt && sub.status === 'trialing'
              ? t('s14Wallet.clientSubs.trialEnds', { date: sub.trialEndsAt.slice(0, 10) })
              : t('s14Wallet.clientSubs.periodEnds', { date: sub.currentPeriodEnd.slice(0, 10) })}
          </p>
          {sub.pendingPlanId ? (
            <p className="text-sm">
              {t('s14Wallet.clientSubs.pendingChange', { date: sub.currentPeriodEnd.slice(0, 10) })}
            </p>
          ) : null}
          {canManage && live ? (
            <span className="flex flex-wrap gap-2">
              {sub.status === 'paused' ? (
                <ActionButton
                  endpoint={`/api/subscriptions/client/${sub.id}/resume`}
                  label={t('s14Wallet.clientSubs.resume')}
                  doneText={t('s14Wallet.clientSubs.resumed')}
                />
              ) : (
                <ActionButton
                  endpoint={`/api/subscriptions/client/${sub.id}/pause`}
                  label={t('s14Wallet.clientSubs.pause')}
                  doneText={t('s14Wallet.clientSubs.paused')}
                />
              )}
              {sub.cancelAtPeriodEnd ? (
                <ActionButton
                  endpoint={`/api/subscriptions/client/${sub.id}/keep`}
                  label={t('s14Wallet.clientSubs.keep')}
                  doneText={t('s14Wallet.clientSubs.kept')}
                />
              ) : null}
            </span>
          ) : null}
        </CardContent>
      </Card>
      {canManage && ['trialing', 'active'].includes(sub.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s14Wallet.clientSubs.changeTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('s14Wallet.clientSubs.changeDescription')}
            </p>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint={`/api/subscriptions/client/${sub.id}/change`}
              submitLabel={t('s14Wallet.clientSubs.change')}
              doneText={t('s14Wallet.clientSubs.changed')}
              fields={[
                {
                  name: 'planId',
                  label: t('s14Wallet.clientSubs.plan'),
                  kind: 'select',
                  initial: sub.planId,
                  options: plans
                    .filter((p) => p.interval === sub.interval)
                    .map((p) => ({ value: p.id, label: `${p.name} - ${p.price} USD` })),
                },
                {
                  name: 'seats',
                  label: t('s14Wallet.clientSubs.seats'),
                  initial: String(sub.seats),
                  whole: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {canManage && live && !sub.cancelAtPeriodEnd ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s14Wallet.clientSubs.cancelEnd')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint={`/api/subscriptions/client/${sub.id}/cancel`}
              submitLabel={t('s14Wallet.clientSubs.cancelEnd')}
              doneText={t('s14Wallet.clientSubs.cancelled')}
              fields={[
                { name: 'reason', label: t('s14Wallet.clientSubs.reason'), required: true },
                {
                  name: 'immediately',
                  label: t('s14Wallet.clientSubs.cancelNow'),
                  kind: 'checkbox',
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.clientSubs.historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {h.at.slice(0, 16).replace('T', ' ')} UTC -{' '}
                {h.event.replace(/_/g, ' ').replace(/:.*/, '')}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
