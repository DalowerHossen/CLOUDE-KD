// path: app/(dashboard)/accounting/journals/new/page.tsx
import type { Metadata } from 'next';
import { JournalEditor } from '@/components/accounting/journal-editor';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { listTemplates } from '@/services/accounting/journals';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New journal entry' };

export default async function NewJournalPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.journal.create', 'tenant', 'journal_entry');
  const companyId = actor.companyId as string;
  let data: Awaited<ReturnType<typeof load>> | null;
  try {
    data = await load(companyId);
  } catch {
    data = null;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('s15Accounting.journals.newTitle')} />
      {data === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <JournalEditor
          accounts={data.accounts}
          templates={data.templates}
          staff={actor.role === 'staff'}
        />
      )}
    </div>
  );
}

async function load(companyId: string): Promise<{
  accounts: { id: string; label: string }[];
  templates: {
    id: string;
    name: string;
    memo: string;
    lines: { accountId: string; debit: string; credit: string; description: string }[];
  }[];
}> {
  const [accounts, templates] = await Promise.all([
    listAccounts(companyId, { status: 'active' }),
    listTemplates(companyId),
  ]);
  return {
    accounts: accounts
      .filter((a) => a.allowPosting)
      .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    templates: templates.map((x) => ({
      id: x.id,
      name: x.name,
      memo: x.memo,
      lines: x.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    })),
  };
}
