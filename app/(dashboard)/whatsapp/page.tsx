// path: app/(dashboard)/whatsapp/page.tsx
import type { Metadata } from 'next';
import {
  ConnectForm,
  AccountPatchButton,
  HealthButton,
  NewTokenButton,
} from '@/components/whatsapp/connect-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getAccount, type AccountView } from '@/services/whatsapp/accounts';
import { WhatsAppTabs } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp' };

export default async function WhatsAppPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_account');
  const canManage = await getService('permissions').can(actor, 'whatsapp.manage', {
    type: 'whatsapp_account',
  });
  let state: { account: AccountView | null } | null;
  try {
    state = { account: await getAccount(actor.companyId as string) };
  } catch {
    state = null;
  }
  const account = state?.account ?? null;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.connection.title')}
        description={t('s16Whatsapp.connection.description')}
        actions={<WhatsAppTabs current="/whatsapp" />}
      />
      {state === null ? (
        <ErrorState description={t('s16Whatsapp.common.loadError')} />
      ) : account === null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Whatsapp.connection.connectTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            <p className="text-sm text-muted-foreground">{t('s16Whatsapp.connection.notSet')}</p>
            {canManage ? <ConnectForm /> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t('s16Whatsapp.connection.statusTitle')}
              <Badge variant="outline">
                {t(
                  `s16Whatsapp.connection.modes.${account.sandbox ? 'sandbox' : 'live'}` as StringKey,
                )}
              </Badge>
              <Badge variant="outline">
                {t(`s16Whatsapp.connection.states.${account.status}` as StringKey)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12 text-sm">
            <dl className="grid gap-sp-8 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('s16Whatsapp.connection.phone')}</dt>
                <dd>{account.displayPhone || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('s16Whatsapp.connection.verifiedName')}
                </dt>
                <dd>{account.verifiedName || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s16Whatsapp.connection.quality')}</dt>
                <dd>{account.qualityRating}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s16Whatsapp.connection.tokenEnds')}</dt>
                <dd>{account.tokenLast4}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s16Whatsapp.connection.lastChecked')}</dt>
                <dd>
                  {account.lastCheckedAt
                    ? account.lastCheckedAt.slice(0, 16).replace('T', ' ')
                    : '-'}
                </dd>
              </div>
              {account.lastError ? (
                <div>
                  <dt className="text-muted-foreground">{t('s16Whatsapp.connection.lastError')}</dt>
                  <dd>{account.lastError}</dd>
                </div>
              ) : null}
            </dl>
            <div>
              <p className="text-muted-foreground">{t('s16Whatsapp.connection.webhookUrl')}</p>
              <code className="block break-all rounded bg-muted p-2 text-xs">
                {account.webhookUrl}
              </code>
              <p className="pt-1 text-muted-foreground">
                {t('s16Whatsapp.connection.webhookHelp')}
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-start gap-2">
                <HealthButton />
                <NewTokenButton />
                <AccountPatchButton
                  version={account.version}
                  patch={{ sandbox: !account.sandbox }}
                  label={t(
                    account.sandbox
                      ? 's16Whatsapp.connection.goLive'
                      : 's16Whatsapp.connection.goSandbox',
                  )}
                />
                <AccountPatchButton
                  version={account.version}
                  patch={{ status: account.status === 'active' ? 'paused' : 'active' }}
                  label={t(
                    account.status === 'active'
                      ? 's16Whatsapp.connection.pause'
                      : 's16Whatsapp.connection.resume',
                  )}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Whatsapp.connection.policyTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{t('s16Whatsapp.connection.policyBody')}</CardContent>
      </Card>
    </div>
  );
}
