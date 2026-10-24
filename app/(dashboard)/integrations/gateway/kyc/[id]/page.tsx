// path: app/(dashboard)/integrations/gateway/kyc/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReviewPanel } from '@/components/gateway/kyc-forms';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { kycCase, type KycCase } from '@/services/gateway/kyc-review';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verification case' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GatewayKycCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const actor = await requirePagePermission('gateway.kyc.review', 'tenant', 'sub_merchant_kyc');
  if (!UUID.test(id)) notFound();
  let detail: KycCase;
  try {
    detail = await kycCase(actor.companyId as string, id);
  } catch {
    notFound();
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={`${t('s16Gateway.kyc.caseTitle')}: ${detail.subMerchantName}`}
        description={t('s16Gateway.kyc.help')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/integrations/gateway" prefetch={false}>
              {t('s16Gateway.kyc.back')}
            </Link>
          </Button>
        }
      />
      <ReviewPanel detail={detail} />
    </div>
  );
}
