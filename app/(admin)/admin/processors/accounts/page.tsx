// path: app/(admin)/admin/processors/accounts/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { accountFormOptions, listAccounts } from '@/services/payment/company-accounts';
import { listCompanies } from '@/services/payment/onboarding';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { AccountsConsole } from './_components/accounts-console';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Company merchant accounts' };

export default async function CompanyAccountsPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.processor.manage', 'platform', 'processor');
  let data: Awaited<ReturnType<typeof load>> | null;
  try {
    data = await load();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Processors.accounts.title')}
        description={t('s10Processors.accounts.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/processors">{t('s10Processors.accounts.back')}</Link>
          </Button>
        }
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s10Processors.accounts.loadError')} />
      ) : (
        <AccountsConsole {...data} />
      )}
    </div>
  );
}

async function load() {
  const [accounts, companies, processors] = await Promise.all([
    listAccounts(),
    listCompanies(),
    accountFormOptions(),
  ]);
  return { accounts, companies, processors };
}
