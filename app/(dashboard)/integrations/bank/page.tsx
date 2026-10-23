// path: app/(dashboard)/integrations/bank/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { ConnectBankForm, LinkButton, MapAccountForm } from '@/components/bankfeed/bank-forms';
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
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  listConnections,
  listFeedAccounts,
  type BankConnectionView,
  type FeedAccountView,
} from '@/services/bankfeed/connections';
import { bookAccounts, type BookAccount } from '@/services/bankfeed/ports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bank feed' };

export default async function BankFeedPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('bankfeed.read', 'tenant', 'bank_feed_connection');
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'bankfeed.manage', {
    type: 'bank_feed_connection',
  });
  const canSync = await permissions.can(actor, 'bankfeed.sync', { type: 'bank_feed_connection' });
  let data: {
    connections: { connection: BankConnectionView; accounts: FeedAccountView[] }[];
    books: BookAccount[];
  } | null;
  try {
    const connections = await listConnections(companyId);
    const withAccounts = await Promise.all(
      connections.map(async (c) => ({
        connection: c,
        accounts: await listFeedAccounts(companyId, c.id),
      })),
    );
    data = { connections: withAccounts, books: await bookAccounts(companyId) };
  } catch {
    data = null;
  }
  const bookOptions = (data?.books ?? [])
    .filter((b) => b.status === 'active')
    .map((b) => ({
      id: b.id,
      label: `${b.name} (${b.bankName}${b.last4 ? ` ...${b.last4}` : ''})`,
    }));
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Bankfeed.page.title')}
        description={t('s16Bankfeed.page.description')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/accounting/reconciliation" prefetch={false}>
              {t('s16Bankfeed.page.reconcile')}
            </Link>
          </Button>
        }
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Bankfeed.page.connectTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectBankForm />
          </CardContent>
        </Card>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s16Bankfeed.common.loadError')} />
      ) : data.connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Bankfeed.page.empty')}</p>
      ) : (
        data.connections.map(({ connection: c, accounts }) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle>
                {c.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  {t(`s16Bankfeed.providers.${c.provider}` as StringKey)}
                  {c.secretLast4 ? ` ...${c.secretLast4}` : ''}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('s16Bankfeed.page.columns.bank')}</TableHead>
                    <TableHead>{t('s16Bankfeed.page.columns.state')}</TableHead>
                    <TableHead>{t('s16Bankfeed.page.columns.synced')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>{c.institutionName ?? t('s16Bankfeed.common.none')}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === 'needs_reauth' || c.status === 'error'
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {t(`s16Bankfeed.page.states.${c.status}` as StringKey)}
                      </Badge>
                      {c.lastError ? (
                        <span className="block text-xs text-destructive">{c.lastError}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {c.lastSyncedAt
                        ? c.lastSyncedAt.slice(0, 16).replace('T', ' ')
                        : t('s16Bankfeed.common.none')}
                    </TableCell>
                    <TableCell>
                      {c.status !== 'disconnected' ? (
                        <div className="flex flex-wrap items-start gap-2">
                          {canManage ? (
                            <LinkButton
                              id={c.id}
                              relink={c.linked}
                              plaid={c.provider === 'plaid'}
                            />
                          ) : null}
                          {canSync && c.status === 'active' ? (
                            <ActionButton
                              endpoint={`/api/integrations/bank/connections/${c.id}/sync`}
                              label={t('s16Bankfeed.page.sync')}
                              doneText={t('s16Bankfeed.page.synced')}
                            />
                          ) : null}
                          {canManage ? (
                            <ActionButton
                              endpoint={`/api/integrations/bank/connections/${c.id}`}
                              method="DELETE"
                              variant="destructive"
                              label={t('s16Bankfeed.page.disconnect')}
                              doneText={t('s16Bankfeed.page.disconnected')}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {c.provider === 'saltedge' ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {t('s16Bankfeed.page.callbackTitle')}
                  </p>
                  <p className="break-all">{c.webhookUrl}</p>
                  <p>{t('s16Bankfeed.page.callbackHelp')}</p>
                  {c.status === 'disconnected' ? null : (
                    <p>{t('s16Bankfeed.page.saltedgeRemoveNote')}</p>
                  )}
                </div>
              ) : null}
              {c.status !== 'new' && c.status !== 'disconnected' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('s16Bankfeed.page.accountsTitle')}</p>
                  {accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('s16Bankfeed.page.accountsEmpty')}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('s16Bankfeed.page.accountColumns.name')}</TableHead>
                          <TableHead>{t('s16Bankfeed.page.accountColumns.mask')}</TableHead>
                          <TableHead>{t('s16Bankfeed.page.accountColumns.book')}</TableHead>
                          <TableHead>{t('s16Bankfeed.page.accountColumns.last')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accounts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              {a.name}
                              {a.currency ? (
                                <span className="block text-xs text-muted-foreground">
                                  {a.currency}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {a.mask ? `...${a.mask}` : t('s16Bankfeed.common.none')}
                            </TableCell>
                            <TableCell>
                              {canManage ? (
                                bookOptions.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    {t('s16Bankfeed.page.noBookAccounts')}
                                  </span>
                                ) : (
                                  <MapAccountForm
                                    connectionId={c.id}
                                    accountId={a.id}
                                    current={a.bankAccountId}
                                    books={bookOptions}
                                    disabled={!a.canMap}
                                  />
                                )
                              ) : (
                                (bookOptions.find((b) => b.id === a.bankAccountId)?.label ??
                                t('s16Bankfeed.page.notMapped'))
                              )}
                            </TableCell>
                            <TableCell>
                              {a.lastImportedAt
                                ? a.lastImportedAt.slice(0, 16).replace('T', ' ')
                                : t('s16Bankfeed.common.none')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <p className="text-xs text-muted-foreground">{t('s16Bankfeed.page.mapNote')}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
