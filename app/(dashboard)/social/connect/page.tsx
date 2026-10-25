// path: app/(dashboard)/social/connect/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { FacebookPicker } from '@/components/social/facebook-picker';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { pendingChoices, type PickView } from '@/services/social/meta-connect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect with Facebook' };

export default async function ConnectFacebookPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.manage', 'tenant', 'social_account');
  const { s } = await searchParams;
  let rows: PickView[] | null = null;
  if (typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s)) {
    try {
      rows = await pendingChoices(actor, s);
    } catch {
      rows = null;
    }
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.connect.title')}
        description={t('s16Social.connect.description')}
      />
      {rows === null || typeof s !== 'string' ? (
        <div className="space-y-sp-12">
          <Alert variant="destructive">{t('s16Social.connect.expired')}</Alert>
          <Button asChild variant="outline">
            <Link href="/social" prefetch={false}>
              {t('s16Social.connect.back')}
            </Link>
          </Button>
        </div>
      ) : (
        <FacebookPicker sessionId={s} rows={rows} />
      )}
    </div>
  );
}
