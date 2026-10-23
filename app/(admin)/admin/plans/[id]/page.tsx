// path: app/(admin)/admin/plans/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm, type FormFieldSpec } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ENTITLEMENT_KEYS } from '@/config/plans';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { keyKind } from '@/lib/payment/plan-rules';
import { getPlanById, planHistory, type PlanView } from '@/services/plan/plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit plan' };

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  const { id } = await params;
  let plan: PlanView | null;
  let history: Awaited<ReturnType<typeof planHistory>> = [];
  try {
    [plan, history] = await Promise.all([getPlanById(id), planHistory(id)]);
  } catch {
    plan = null;
  }
  if (!plan) return <ErrorState description={t('s14Wallet.common.loadError')} />;
  const features: FormFieldSpec[] = ENTITLEMENT_KEYS.map((key) => {
    const value = plan.entitlements[key];
    return keyKind(key) === 'switch'
      ? {
          name: key,
          label: t(`s14Wallet.plans.keys.${key}` as StringKey),
          kind: 'checkbox',
          initial: value === true ? 'true' : 'false',
        }
      : {
          name: key,
          label: t(`s14Wallet.plans.keys.${key}` as StringKey),
          initial: typeof value === 'number' ? String(value) : '',
          whole: true,
        };
  });
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={`${plan.name} (${plan.slug})`}
        description={t('s14Wallet.plans.pageDescription')}
        actions={
          plan.status === 'active' ? (
            plan.slug === 'free' ? undefined : (
              <ActionButton
                endpoint={`/api/plans/manage/${plan.id}/archive`}
                variant="destructive"
                label={t('s14Wallet.plans.archive')}
                doneText={t('s14Wallet.plans.archivedDone')}
              />
            )
          ) : (
            <ActionButton
              endpoint={`/api/plans/manage/${plan.id}/restore`}
              label={t('s14Wallet.plans.restore')}
              doneText={t('s14Wallet.plans.restoredDone')}
            />
          )
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.plans.detailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonForm
            endpoint={`/api/plans/manage/${plan.id}`}
            method="PUT"
            nest="changes"
            fixed={{ version: plan.version }}
            emptyAsNull
            submitLabel={t('s14Wallet.common.save')}
            doneText={t('s14Wallet.plans.saved')}
            fields={[
              { name: 'name', label: t('s14Wallet.plans.name'), initial: plan.name },
              {
                name: 'description',
                label: t('s14Wallet.plans.description'),
                initial: plan.description,
              },
              {
                name: 'priceMonthly',
                label: t('s14Wallet.plans.priceMonthly'),
                initial: plan.priceMonthly,
              },
              {
                name: 'priceYearly',
                label: t('s14Wallet.plans.priceYearly'),
                initial: plan.priceYearly,
              },
              {
                name: 'seatPriceMonthly',
                label: t('s14Wallet.plans.seatPrice'),
                initial: plan.seatPriceMonthly,
              },
              {
                name: 'trialDays',
                label: t('s14Wallet.plans.trialDays'),
                initial: String(plan.trialDays),
                whole: true,
              },
              {
                name: 'sortOrder',
                label: t('s14Wallet.plans.sortOrder'),
                initial: String(plan.sortOrder),
                whole: true,
              },
              { name: 'badge', label: t('s14Wallet.plans.badge'), initial: plan.badge ?? '' },
              {
                name: 'visible',
                label: t('s14Wallet.plans.visible'),
                kind: 'checkbox',
                initial: plan.visible ? 'true' : 'false',
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.plans.featuresTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('s14Wallet.plans.featuresDescription')}
          </p>
        </CardHeader>
        <CardContent>
          <JsonForm
            endpoint={`/api/plans/manage/${plan.id}/entitlements`}
            method="PUT"
            nest="values"
            emptyAsNull
            submitLabel={t('s14Wallet.common.save')}
            doneText={t('s14Wallet.plans.featuresSaved')}
            fields={features}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.plans.historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {h.at.slice(0, 16).replace('T', ' ')} UTC - {h.action}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
