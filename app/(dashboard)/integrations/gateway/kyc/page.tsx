// path: app/(dashboard)/integrations/gateway/kyc/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { kycQueue, type KycQueueItem } from '@/services/gateway/kyc-review';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verification of sub-merchants' };

const utc = (v: string | null): string => (v ? v.replace('T', ' ').slice(0, 16) : '-');

export default async function GatewayKycQueuePage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('gateway.kyc.review', 'tenant', 'sub_merchant_kyc');
  let rows: KycQueueItem[] | null;
  try {
    rows = await kycQueue(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16Gateway.kyc.title')}
        description={t('s16Gateway.kyc.help')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/integrations/gateway" prefetch={false}>
              {t('s16Gateway.kyc.back')}
            </Link>
          </Button>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s16Gateway.common.loadError')} />
      ) : rows.length === 0 ? (
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
            {rows.map((k) => (
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
    </div>
  );
}
