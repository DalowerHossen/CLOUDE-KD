// path: app/(dashboard)/integrations/stores/conflicts/page.tsx
import type { Metadata } from 'next';
import { ConflictButtons } from '@/components/integration/commerce-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { listConflicts, type ConflictView } from '@/services/integration/commerce-conflicts';
import { StoreTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Store conflicts' };

export default async function StoreConflictsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('commerce.read', 'tenant', 'integration_conflict');
  const canSync = await getService('permissions').can(actor, 'commerce.sync', {
    type: 'integration_conflict',
  });
  let conflicts: ConflictView[] | null;
  try {
    conflicts = await listConflicts(actor.companyId as string, { limit: 100 });
  } catch {
    conflicts = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Commerce.conflicts.title')}
        description={t('s16Commerce.conflicts.description')}
        actions={<StoreTabs current="/integrations/stores/conflicts" />}
      />
      {conflicts === null ? (
        <ErrorState description={t('s16Commerce.common.loadError')} />
      ) : conflicts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Commerce.conflicts.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Commerce.conflicts.columns.order')}</TableHead>
                  <TableHead>{t('s16Commerce.conflicts.columns.kind')}</TableHead>
                  <TableHead>{t('s16Commerce.conflicts.columns.detail')}</TableHead>
                  <TableHead>{t('s16Commerce.conflicts.columns.state')}</TableHead>
                  <TableHead>{t('s16Commerce.conflicts.columns.when')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.orderLabel}</TableCell>
                    <TableCell>{t(`s16Commerce.conflicts.kinds.${c.kind}` as StringKey)}</TableCell>
                    <TableCell className="text-xs">
                      {c.detail}
                      {c.resolution ? (
                        <span className="block text-muted-foreground">{c.resolution}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Commerce.conflicts.states.${c.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell>
                      {canSync && c.status === 'open' ? <ConflictButtons id={c.id} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
