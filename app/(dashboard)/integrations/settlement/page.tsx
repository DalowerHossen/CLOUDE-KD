// path: app/(dashboard)/integrations/settlement/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  EntriesForm,
  IngestKeyForm,
  RevokeIngestKey,
  PayoutForm,
  RemoveTerms,
  TermsForm,
  VoidPayout,
} from '@/components/settlement/ledger-forms';
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
import type { Balance } from '@/lib/gateway/split-rules';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { balanceOfSub } from '@/services/gateway/balances';
import { listEntries, type EntryView } from '@/services/gateway/entries';
import { listIngestKeys, type IngestKeyView } from '@/services/gateway/ingest-keys';
import { listSubMerchants, type SubMerchantView } from '@/services/gateway/sub-merchants';
import { listTerms, type TermsView } from '@/services/gateway/terms';
import { listPayouts, type PayoutView } from '@/services/gateway/transfers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sub-merchant settlement' };

const utc = (v: string | null): string => (v ? v.replace('T', ' ').slice(0, 16) : '-');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Loaded {
  subs: { sub: SubMerchantView; balance: Balance }[];
  terms: TermsView[];
  keys: IngestKeyView[];
  selected: { sub: SubMerchantView; entries: EntryView[]; payouts: PayoutView[] } | null;
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('settlement.read', 'tenant', 'settlement_entry');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'settlement.manage', {
    type: 'settlement_entry',
  });
  const { sub: wanted } = await searchParams;
  let data: Loaded | null;
  try {
    const [subs, terms, keys] = await Promise.all([
      listSubMerchants(companyId),
      listTerms(companyId),
      listIngestKeys(companyId),
    ]);
    const withBalance = await Promise.all(
      subs.map(async (sub) => ({ sub, balance: await balanceOfSub(companyId, sub.id) })),
    );
    const pick = wanted && UUID.test(wanted) ? subs.find((s) => s.id === wanted) : undefined;
    data = {
      subs: withBalance,
      terms,
      keys,
      selected: pick
        ? {
            sub: pick,
            entries: await listEntries(companyId, pick.id, 50, null),
            payouts: await listPayouts(companyId, pick.id),
          }
        : null,
    };
  } catch {
    data = null;
  }
  const names = new Map((data?.subs ?? []).map((s) => [s.sub.id, s.sub.name]));
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Settlement.page.title')}
        description={t('s16Settlement.page.description')}
      />
      {data === null ? (
        <ErrorState description={t('s16Settlement.common.loadError')} />
      ) : data.subs.length === 0 ? (
        <p className="text-sm">{t('s16Settlement.page.empty')}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Settlement.page.balances')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('s16Settlement.balance.negativeHelp')}
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('s16Settlement.page.sub')}</TableHead>
                    <TableHead>{t('s16Settlement.balance.total')}</TableHead>
                    <TableHead>{t('s16Settlement.balance.pending')}</TableHead>
                    <TableHead>{t('s16Settlement.balance.paid')}</TableHead>
                    <TableHead>{t('s16Settlement.balance.available')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subs.map(({ sub, balance }) => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.name}</TableCell>
                      <TableCell className="tabular-nums">{balance.totalNet}</TableCell>
                      <TableCell className="tabular-nums">{balance.pending}</TableCell>
                      <TableCell className="tabular-nums">{balance.paid}</TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {balance.available}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="underline"
                          href={`/integrations/settlement?sub=${sub.id}`}
                          prefetch={false}
                        >
                          {t('s16Settlement.page.open')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Settlement.terms.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('s16Settlement.terms.help')}</p>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.terms.length === 0 ? (
                <p className="text-sm">{t('s16Settlement.terms.none')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Settlement.terms.scope')}</TableHead>
                      <TableHead>{t('s16Settlement.terms.commission')}</TableHead>
                      <TableHead>{t('s16Settlement.terms.fee')}</TableHead>
                      <TableHead>{t('s16Settlement.terms.hold')}</TableHead>
                      <TableHead>{t('s16Settlement.terms.min')}</TableHead>
                      <TableHead>{t('s16Settlement.terms.from')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.terms.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          {v.subMerchantId
                            ? (names.get(v.subMerchantId) ?? '-')
                            : t('s16Settlement.terms.all')}
                        </TableCell>
                        <TableCell className="tabular-nums">{v.commissionPercent}</TableCell>
                        <TableCell className="tabular-nums">{v.fixedFee}</TableCell>
                        <TableCell className="tabular-nums">{v.holdDays}</TableCell>
                        <TableCell className="tabular-nums">{v.minPayout}</TableCell>
                        <TableCell>{utc(v.effectiveFrom)}</TableCell>
                        <TableCell>{canManage ? <RemoveTerms id={v.id} /> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {canManage ? (
                <TermsForm
                  subOptions={data.subs.map((s) => ({ id: s.sub.id, name: s.sub.name }))}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Settlement.ingest.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('s16Settlement.ingest.help')}</p>
              <p className="font-mono text-xs">{t('s16Settlement.ingest.endpoint')}</p>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.keys.length === 0 ? (
                <p className="text-sm">{t('s16Settlement.ingest.empty')}</p>
              ) : (
                <ul className="space-y-sp-4 text-sm">
                  {data.keys.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center gap-sp-8">
                      <span>{k.name}</span>
                      <code className="text-xs">{k.masked}</code>
                      <Badge variant="outline">
                        {t(`s16Settlement.ingest.states.${k.state}` as StringKey)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t('s16Settlement.ingest.lastUsed')}: {utc(k.lastUsedAt)}
                      </span>
                      {canManage && k.state === 'active' ? <RevokeIngestKey id={k.id} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? <IngestKeyForm /> : null}
            </CardContent>
          </Card>

          {data.selected ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('s16Settlement.entries.title')}: {data.selected.sub.name}
                  </CardTitle>
                  <div>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/integrations/settlement/statement?subMerchantId=${data.selected.sub.id}`}
                      >
                        {t('s16Settlement.entries.statement')}
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  {data.selected.entries.length === 0 ? (
                    <p className="text-sm">{t('s16Settlement.entries.empty')}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('s16Settlement.entries.date')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.kind')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.ref')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.gross')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.commission')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.fee')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.net')}</TableHead>
                          <TableHead>{t('s16Settlement.entries.payable')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.selected.entries.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>{utc(e.occurredAt)}</TableCell>
                            <TableCell>
                              {t(`s16Settlement.entries.kinds.${e.kind}` as StringKey)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{e.externalRef}</TableCell>
                            <TableCell className="tabular-nums">{e.gross}</TableCell>
                            <TableCell className="tabular-nums">{e.commission}</TableCell>
                            <TableCell className="tabular-nums">{e.fixedFee}</TableCell>
                            <TableCell className="tabular-nums">{e.net}</TableCell>
                            <TableCell>{utc(e.availableAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {canManage ? <EntriesForm subMerchantId={data.selected.sub.id} /> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('s16Settlement.payouts.title')}: {data.selected.sub.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  {data.selected.payouts.length === 0 ? (
                    <p className="text-sm">{t('s16Settlement.payouts.empty')}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('s16Settlement.payouts.paidAt')}</TableHead>
                          <TableHead>{t('s16Settlement.payouts.amount')}</TableHead>
                          <TableHead>{t('s16Settlement.payouts.reference')}</TableHead>
                          <TableHead />
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.selected.payouts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{utc(p.paidAt)}</TableCell>
                            <TableCell className="tabular-nums">{p.amount}</TableCell>
                            <TableCell>{p.reference}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === 'void' ? 'outline' : 'default'}>
                                {t(`s16Settlement.payouts.states.${p.status}` as StringKey)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {canManage && p.status === 'recorded' ? (
                                <VoidPayout id={p.id} version={p.version} />
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {canManage ? <PayoutForm subMerchantId={data.selected.sub.id} /> : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
