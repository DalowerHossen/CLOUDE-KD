// path: app/(dashboard)/integrations/automation/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { siteUrl } from '@/lib/cms/site-url';
import { t, type StringKey } from '@/lib/i18n';
import { TRIGGERS } from '@/lib/integrations/automation-rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { listHooks } from '@/services/integration/automation';
import type { EndpointView } from '@/services/webhookout/endpoints';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Automation tools' };

const API_PATH = '/api/public/v1';

export default async function AutomationPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'integrations.webhook.read',
    'tenant',
    'webhook_endpoint',
  );
  const origin = siteUrl();
  let hooks: EndpointView[] | null;
  try {
    hooks = await listHooks(actor.companyId as string);
  } catch {
    hooks = null;
  }
  const actions: { name: StringKey; call: string; scope: string; note: StringKey | null }[] = [
    {
      name: 's16Automation.actions.createClient',
      call: `POST ${API_PATH}/clients`,
      scope: 'write:clients',
      note: 's16Automation.actions.sandboxOnly',
    },
    {
      name: 's16Automation.actions.createInvoice',
      call: `POST ${API_PATH}/invoices`,
      scope: 'write:invoices',
      note: 's16Automation.actions.sandboxOnly',
    },
    {
      name: 's16Automation.actions.createEstimate',
      call: `POST ${API_PATH}/estimates`,
      scope: 'write:estimates',
      note: 's16Automation.actions.sandboxOnly',
    },
    {
      name: 's16Automation.actions.paymentNote',
      call: `POST ${API_PATH}/automation/actions/record-payment-note`,
      scope: 'write:invoices',
      note: 's16Automation.actions.sandboxOnly',
    },
    {
      name: 's16Automation.actions.sendInvoice',
      call: '-',
      scope: '-',
      note: 's16Automation.actions.notAvailable',
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Automation.title')}
        description={t('s16Automation.description')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/developers" prefetch={false}>
              {t('s16Automation.nav.automation')}
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Automation.connect.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{t('s16Automation.connect.keys')}</p>
          <p>
            {t('s16Automation.connect.address')}: <code>{`${origin}${API_PATH}`}</code>
          </p>
          <p>{t('s16Automation.connect.auth')}</p>
          <p>{t('s16Automation.connect.sandbox')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Automation.triggers.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <p className="text-sm text-muted-foreground">{t('s16Automation.triggers.help')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('s16Automation.triggers.columns.name')}</TableHead>
                <TableHead>{t('s16Automation.triggers.columns.scope')}</TableHead>
                <TableHead>{t('s16Automation.triggers.columns.poll')}</TableHead>
                <TableHead>{t('s16Automation.triggers.columns.event')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRIGGERS.map((tr) => (
                <TableRow key={tr.name}>
                  <TableCell>{t(`s16Automation.triggers.names.${tr.name}` as StringKey)}</TableCell>
                  <TableCell>
                    <code>{tr.scope}</code>
                  </TableCell>
                  <TableCell className="break-all">
                    <code>{`GET ${API_PATH}/automation/triggers/${tr.name}`}</code>
                  </TableCell>
                  <TableCell>
                    <code>{tr.event}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Automation.actions.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <p className="text-sm text-muted-foreground">{t('s16Automation.actions.help')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('s16Automation.actions.columns.name')}</TableHead>
                <TableHead>{t('s16Automation.actions.columns.call')}</TableHead>
                <TableHead>{t('s16Automation.actions.columns.scope')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.name}>
                  <TableCell>
                    {t(a.name)}
                    {a.note ? (
                      <span className="block text-xs text-muted-foreground">{t(a.note)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="break-all">
                    <code>{a.call}</code>
                  </TableCell>
                  <TableCell>
                    <code>{a.scope}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Automation.hooks.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          {hooks === null ? (
            <ErrorState description={t('s16Automation.common.loadError')} />
          ) : hooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Automation.hooks.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Automation.hooks.columns.source')}</TableHead>
                  <TableHead>{t('s16Automation.hooks.columns.url')}</TableHead>
                  <TableHead>{t('s16Automation.hooks.columns.events')}</TableHead>
                  <TableHead>{t('s16Automation.hooks.columns.state')}</TableHead>
                  <TableHead>{t('s16Automation.hooks.columns.failures')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      {t(`s16Automation.hooks.sources.${h.source === 'make' ? 'make' : 'zapier'}`)}
                    </TableCell>
                    <TableCell className="break-all">{h.url}</TableCell>
                    <TableCell>{h.events.join(', ')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Automation.hooks.states.${h.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>{h.consecutiveFailures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-sm text-muted-foreground">
            {t('s16Automation.hooks.manage')}{' '}
            <Link href="/developers/webhooks" prefetch={false} className="underline">
              /developers/webhooks
            </Link>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Automation.extension.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{t('s16Automation.extension.help')}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <code>{t('s16Automation.extension.step1', { origin })}</code>
            </li>
            <li>{t('s16Automation.extension.step2')}</li>
            <li>{t('s16Automation.extension.step3')}</li>
          </ol>
          <p className="text-muted-foreground">{t('s16Automation.extension.notBuilt')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
