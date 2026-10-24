// path: app/(dashboard)/integrations/gateway/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { KycLinkButton } from '@/components/gateway/kyc-forms';
import {
  KeyForm,
  RouteForm,
  RowAction,
  SubMerchantForm,
  UpstreamActions,
  UpstreamForm,
} from '@/components/gateway/gateway-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCalls, type CallView } from '@/services/gateway/calls';
import { kycQueue, type KycQueueItem } from '@/services/gateway/kyc-review';
import { listSubKeys, type SubKeyView } from '@/services/gateway/keys';
import { listRoutes, type RouteView } from '@/services/gateway/routes';
import { listSubMerchants, type SubMerchantView } from '@/services/gateway/sub-merchants';
import { getUpstream, type UpstreamView } from '@/services/gateway/upstream';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sub-merchant gateway' };

const utc = (v: string | null): string => (v ? v.replace('T', ' ').slice(0, 16) : '-');

interface Loaded {
  upstream: UpstreamView | null;
  routes: RouteView[];
  subs: { sub: SubMerchantView; keys: SubKeyView[] }[];
  calls: CallView[];
  kyc: KycQueueItem[];
  canReview: boolean;
}

export default async function GatewayPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('gateway.read', 'tenant', 'gateway_upstream');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'gateway.manage', {
    type: 'gateway_upstream',
  });
  let data: Loaded | null;
  try {
    const canReview = await getService('permissions').can(actor, 'gateway.kyc.review', {
      type: 'sub_merchant_kyc',
    });
    const [upstream, routes, subs, calls, kyc] = await Promise.all([
      getUpstream(companyId),
      listRoutes(companyId),
      listSubMerchants(companyId),
      listCalls(companyId, null, 30),
      canReview ? kycQueue(companyId) : Promise.resolve([]),
    ]);
    data = {
      upstream,
      routes,
      subs: await Promise.all(
        subs.map(async (sub) => ({ sub, keys: await listSubKeys(companyId, sub.id) })),
      ),
      calls,
      kyc,
      canReview,
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Gateway.page.title')}
        description={t('s16Gateway.page.description')}
      />
      {data === null ? (
        <ErrorState description={t('s16Gateway.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Gateway.upstream.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('s16Gateway.upstream.help')}</p>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.upstream === null ? (
                canManage ? (
                  <UpstreamForm />
                ) : (
                  <p className="text-sm">{t('s16Gateway.upstream.none')}</p>
                )
              ) : (
                <>
                  <dl className="grid gap-sp-8 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">{t('s16Gateway.routes.state')}</dt>
                      <dd>
                        <Badge variant={data.upstream.enabled ? 'default' : 'outline'}>
                          {data.upstream.enabled
                            ? t('s16Gateway.upstream.enabled')
                            : t('s16Gateway.upstream.disabled')}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('s16Gateway.upstream.baseUrl')}</dt>
                      <dd className="break-all">{data.upstream.baseUrl}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('s16Gateway.upstream.secret')}</dt>
                      <dd>...{data.upstream.secretLast4}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('s16Gateway.upstream.failures')}</dt>
                      <dd>{data.upstream.consecutiveFailures}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('s16Gateway.upstream.lastSuccess')}
                      </dt>
                      <dd>{utc(data.upstream.lastSuccessAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('s16Gateway.upstream.lastError')}
                      </dt>
                      <dd>{data.upstream.lastError ?? t('s16Gateway.common.none')}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {t('s16Gateway.upstream.secretHelp')}
                  </p>
                  {canManage ? (
                    <UpstreamActions
                      enabled={data.upstream.enabled}
                      kycRequired={data.upstream.kycRequired}
                      version={data.upstream.version}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Gateway.routes.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('s16Gateway.routes.help')}</p>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.routes.length === 0 ? (
                <p className="text-sm">{t('s16Gateway.routes.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Gateway.routes.name')}</TableHead>
                      <TableHead>{t('s16Gateway.routes.method')}</TableHead>
                      <TableHead>{t('s16Gateway.routes.path')}</TableHead>
                      <TableHead>{t('s16Gateway.routes.state')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.routes.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.method}</TableCell>
                        <TableCell className="font-mono text-xs">{r.pathTemplate}</TableCell>
                        <TableCell>
                          <Badge variant={r.enabled ? 'default' : 'outline'}>
                            {r.enabled
                              ? t('s16Gateway.upstream.enabled')
                              : t('s16Gateway.upstream.disabled')}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-sp-8">
                          {canManage ? (
                            <>
                              <RowAction
                                endpoint={`/api/integrations/gateway/routes/${r.id}`}
                                method="PATCH"
                                body={{ enabled: !r.enabled, version: r.version }}
                                label={
                                  r.enabled
                                    ? t('s16Gateway.routes.turnOff')
                                    : t('s16Gateway.routes.turnOn')
                                }
                              />
                              <RowAction
                                endpoint={`/api/integrations/gateway/routes/${r.id}`}
                                method="DELETE"
                                label={t('s16Gateway.routes.remove')}
                                variant="destructive"
                              />
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {canManage ? <RouteForm /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Gateway.subs.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-16">
              {data.subs.length === 0 ? (
                <p className="text-sm">{t('s16Gateway.subs.empty')}</p>
              ) : (
                data.subs.map(({ sub, keys }) => (
                  <section key={sub.id} className="space-y-sp-8 rounded-md border p-sp-12">
                    <div className="flex flex-wrap items-center justify-between gap-sp-8">
                      <h3 className="font-medium">
                        {sub.name}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          {sub.reference}
                        </span>
                      </h3>
                      <Badge variant={sub.status === 'active' ? 'default' : 'outline'}>
                        {t(`s16Gateway.subs.states.${sub.status}` as StringKey)}
                      </Badge>
                    </div>
                    {canManage && sub.status !== 'closed' ? (
                      <div className="flex flex-wrap gap-sp-8">
                        <RowAction
                          endpoint={`/api/integrations/gateway/sub-merchants/${sub.id}`}
                          method="PATCH"
                          body={{
                            status: sub.status === 'active' ? 'suspended' : 'active',
                            version: sub.version,
                          }}
                          label={
                            sub.status === 'active'
                              ? t('s16Gateway.subs.suspend')
                              : t('s16Gateway.subs.activate')
                          }
                        />
                        <RowAction
                          endpoint={`/api/integrations/gateway/sub-merchants/${sub.id}`}
                          method="PATCH"
                          body={{ status: 'closed', version: sub.version }}
                          label={t('s16Gateway.subs.close')}
                          variant="destructive"
                        />
                      </div>
                    ) : null}
                    <h4 className="text-sm font-medium">{t('s16Gateway.keys.title')}</h4>
                    {keys.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('s16Gateway.keys.none')}</p>
                    ) : (
                      <ul className="space-y-sp-4 text-sm">
                        {keys.map((k) => (
                          <li key={k.id} className="flex flex-wrap items-center gap-sp-8">
                            <span>{k.name}</span>
                            <code className="text-xs">{k.masked}</code>
                            <Badge variant="outline">
                              {t(`s16Gateway.keys.states.${k.state}` as StringKey)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {t('s16Gateway.keys.lastUsed')}: {utc(k.lastUsedAt)}
                            </span>
                            {canManage && k.state === 'active' ? (
                              <RowAction
                                endpoint={`/api/integrations/gateway/keys/${k.id}`}
                                method="DELETE"
                                label={t('s16Gateway.keys.revoke')}
                                variant="destructive"
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canManage && sub.status === 'active' ? (
                      <KeyForm subMerchantId={sub.id} />
                    ) : null}
                    <p className="text-sm">
                      <strong>{t('s16Gateway.kyc.title')}:</strong>{' '}
                      {sub.kycVerified && sub.kycApprovedUntil
                        ? `${t('s16Gateway.kyc.verifiedUntil')} ${utc(sub.kycApprovedUntil).slice(0, 10)}`
                        : t('s16Gateway.kyc.notVerified')}
                    </p>
                    {data.canReview && sub.status === 'active' ? (
                      <KycLinkButton subMerchantId={sub.id} />
                    ) : null}
                  </section>
                ))
              )}
              {canManage ? <SubMerchantForm /> : null}
            </CardContent>
          </Card>

          {data.canReview ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Gateway.kyc.title')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('s16Gateway.kyc.help')}</p>
                <p className="text-sm">
                  {data.upstream?.kycRequired === false
                    ? t('s16Gateway.kyc.notRequired')
                    : t('s16Gateway.kyc.required')}
                </p>
              </CardHeader>
              <CardContent>
                {data.kyc.length === 0 ? (
                  <p className="text-sm">{t('s16Gateway.kyc.queueEmpty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('s16Gateway.kyc.sub')}</TableHead>
                        <TableHead>{t('s16Gateway.kyc.state')}</TableHead>
                        <TableHead>{t('s16Gateway.kyc.submitted')}</TableHead>
                        <TableHead>{t('s16Gateway.kyc.risk')}</TableHead>
                        <TableHead>{t('s16Gateway.kyc.screening')}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.kyc.map((k) => (
                        <TableRow key={k.id}>
                          <TableCell>{k.subMerchantName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {t(`s16Gateway.kyc.states.${k.status}` as StringKey)}
                            </Badge>
                          </TableCell>
                          <TableCell>{utc(k.submittedAt)}</TableCell>
                          <TableCell>{k.risk ?? '-'}</TableCell>
                          <TableCell>
                            {t(`s16Gateway.kyc.screeningStates.${k.screeningStatus}` as StringKey)}
                          </TableCell>
                          <TableCell>
                            <Link
                              className="underline"
                              href={`/integrations/gateway/kyc/${k.id}`}
                              prefetch={false}
                            >
                              {t('s16Gateway.kyc.open')}
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Gateway.calls.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.calls.length === 0 ? (
                <p className="text-sm">{t('s16Gateway.calls.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Gateway.calls.time')}</TableHead>
                      <TableHead>{t('s16Gateway.calls.request')}</TableHead>
                      <TableHead>{t('s16Gateway.calls.status')}</TableHead>
                      <TableHead>{t('s16Gateway.calls.outcome')}</TableHead>
                      <TableHead>{t('s16Gateway.calls.duration')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.calls.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{utc(c.createdAt)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.method} {c.pathTemplate || '-'}
                        </TableCell>
                        <TableCell>{c.statusCode ?? '-'}</TableCell>
                        <TableCell>
                          {t(`s16Gateway.calls.outcomes.${c.outcome}` as StringKey)}
                        </TableCell>
                        <TableCell>{c.durationMs}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
