// path: app/(dashboard)/developers/checkout/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateKeyForm } from '@/components/developers/key-forms';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Store checkout' };

export default async function StoreCheckoutPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('integrations.apikey.read', 'tenant', 'api_key');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'integrations.apikey.manage', {
    type: 'api_key',
  });
  const [status, verified] = await Promise.all([
    getService('kyc')
      .status(companyId)
      .catch(() => 'not_submitted' as const),
    getService('kyc')
      .isVerified(companyId)
      .catch(() => false),
  ]);
  const base = new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Developers.checkout.title')}
        description={t('s16Developers.checkout.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/developers" prefetch={false}>
                {t('s16Developers.checkout.keysLink')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/developers/webhooks" prefetch={false}>
                {t('s16Developers.checkout.webhooksLink')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/developers/docs" prefetch={false}>
                {t('s16Developers.checkout.docsLink')}
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Developers.checkout.kycTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <Alert variant={verified ? 'success' : 'default'}>
            {verified
              ? t('s16Developers.checkout.kycApproved')
              : t('s16Developers.checkout.kycOther', { status })}
          </Alert>
          {verified ? null : (
            <Button asChild variant="outline">
              <Link href="/settings/kyc" prefetch={false}>
                {t('s16Developers.checkout.kycLink')}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
      {verified && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Developers.checkout.keyTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('s16Developers.checkout.keyHint')}</p>
          </CardHeader>
          <CardContent>
            <CreateKeyForm scopes={['write:checkout', 'read:checkout']} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Developers.checkout.stepsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-sp-8 pl-5 text-sm">
            <li>{t('s16Developers.checkout.step1', { base })}</li>
            <li>{t('s16Developers.checkout.step2')}</li>
            <li>{t('s16Developers.checkout.step3')}</li>
            <li>{t('s16Developers.checkout.step4', { base })}</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
