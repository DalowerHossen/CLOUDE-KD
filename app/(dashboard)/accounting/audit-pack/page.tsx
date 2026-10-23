// path: app/(dashboard)/accounting/audit-pack/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPacks, type PackRecord } from '@/services/accounting/audit-pack';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit pack' };

export default async function AuditPackPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.audit.export', 'tenant', 'audit_pack');
  let packs: PackRecord[] | null;
  try {
    packs = await listPacks(actor.companyId as string);
  } catch {
    packs = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const columns: readonly DataColumn<PackRecord>[] = [
    {
      key: 'when',
      header: t('s15Accounting.auditPack.columns.when'),
      primary: true,
      cell: (r) => r.createdAt.slice(0, 16).replace('T', ' '),
    },
    {
      key: 'period',
      header: t('s15Accounting.auditPack.columns.period'),
      cell: (r) => `${r.from} - ${r.to}`,
    },
    {
      key: 'entries',
      header: t('s15Accounting.auditPack.columns.entries'),
      hideOnMobile: true,
      cell: (r) => String(r.entries),
    },
    {
      key: 'trail',
      header: t('s15Accounting.auditPack.columns.trail'),
      hideOnMobile: true,
      cell: (r) => String(r.auditRows),
    },
    {
      key: 'chain',
      header: t('s15Accounting.auditPack.columns.chain'),
      cell: (r) => (
        <Badge variant={r.chainOk ? 'outline' : 'destructive'}>
          {r.chainOk
            ? t('s15Accounting.auditPack.chainOk')
            : t('s15Accounting.auditPack.chainBroken')}
        </Badge>
      ),
    },
    {
      key: 'sum',
      header: t('s15Accounting.auditPack.columns.checksum'),
      hideOnMobile: true,
      cell: (r) => <code className="break-all text-xs">{r.manifestSha256}</code>,
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.auditPack.title')}
        description={t('s15Accounting.auditPack.description')}
      />
      {packs === null ? (
        <ErrorState description={t('s15Accounting.auditPack.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.auditPack.makeTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">
                {t('s15Accounting.auditPack.makeHelp')}
              </p>
              <form
                method="get"
                action="/api/accounting/audit-pack/download"
                className="flex flex-wrap items-end gap-sp-8"
              >
                <div className="space-y-1">
                  <Label htmlFor="ap-from">{t('s15Accounting.auditPack.from')}</Label>
                  <Input
                    id="ap-from"
                    name="from"
                    type="date"
                    defaultValue={`${today.slice(0, 4)}-01-01`}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ap-to">{t('s15Accounting.auditPack.to')}</Label>
                  <Input id="ap-to" name="to" type="date" defaultValue={today} required />
                </div>
                <Button type="submit">{t('s15Accounting.auditPack.make')}</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.auditPack.historyTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                rows={packs}
                getRowId={(r) => r.id}
                caption={t('s15Accounting.auditPack.historyTitle')}
                empty={<EmptyState title={t('s15Accounting.auditPack.empty')} />}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
