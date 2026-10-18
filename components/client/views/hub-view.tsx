// path: components/client/views/hub-view.tsx
import type { ReactNode } from 'react';
import { HubList } from '@/components/client/hub-list';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import type { PortalSubject } from '@/services/portal/events';
import { getPortalHub } from '@/services/portal/hub';

/** The client hub: the status summary and the list of invoices sent to this client. */
export async function renderHubView(subject: PortalSubject, token: string): Promise<ReactNode> {
  const hub = await getPortalHub(subject);
  return (
    <section className="space-y-sp-16" aria-labelledby="hub-title">
      <Card>
        <CardHeader>
          <CardTitle id="hub-title">{t('s13Portal.hub.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-sp-12 sm:grid-cols-4">
            <div>
              <dt className="text-caption text-muted-foreground">
                {t('s13Portal.hub.openBalance')}
              </dt>
              <dd className="font-semibold tabular-nums">USD {hub.openBalance}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{t('s13Portal.hub.openCount')}</dt>
              <dd className="font-semibold">{hub.openCount}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                {t('s13Portal.hub.overdueCount')}
              </dt>
              <dd className="font-semibold">{hub.overdueCount}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{t('s13Portal.hub.paidCount')}</dt>
              <dd className="font-semibold">{hub.paidCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {hub.truncated ? <Alert>{t('s13Portal.hub.truncated')}</Alert> : null}
      <HubList token={token} rows={hub.rows} />
    </section>
  );
}
