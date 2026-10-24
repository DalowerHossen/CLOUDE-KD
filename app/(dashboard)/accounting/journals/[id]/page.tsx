// path: app/(dashboard)/accounting/journals/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { AttachmentForm } from '@/components/accounting/attachment-form';
import { JournalEditor } from '@/components/accounting/journal-editor';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { getJournal, type JournalView } from '@/services/accounting/journals';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Journal entry' };

export default async function JournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'journal_entry');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const companyId = actor.companyId as string;
  const perms = getService('permissions');
  const [canCreate, canPost] = await Promise.all([
    perms.can(actor, 'accounting.journal.create', { type: 'journal_entry' }),
    perms.can(actor, 'accounting.journal.post', { type: 'journal_entry' }),
  ]);
  let entry: JournalView | null;
  try {
    entry = await getJournal(companyId, id);
  } catch {
    notFound();
  }
  if (!entry) return <ErrorState description={t('s15Accounting.common.loadError')} />;
  const accounts =
    entry.status === 'draft' && canCreate
      ? (await listAccounts(companyId, { status: 'active' }))
          .filter((a) => a.allowPosting)
          .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))
      : [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={`${t('s15Accounting.journals.detailTitle')} ${entry.number ?? ''}`.trim()}
        description={entry.memo}
        actions={
          <Badge variant="outline">
            {t(`s15Accounting.journals.statuses.${entry.status}` as StringKey)}
          </Badge>
        }
      />
      {entry.status === 'draft' && canCreate ? (
        <>
          <JournalEditor
            accounts={accounts}
            templates={[]}
            staff={actor.role === 'staff'}
            edit={{ id: entry.id, version: entry.version }}
            initial={{
              entryDate: entry.entryDate,
              memo: entry.memo,
              note: entry.note,
              lines: entry.lines.map((l) => ({
                accountId: l.accountId,
                debit: l.debit === '0.0000' ? '' : l.debit,
                credit: l.credit === '0.0000' ? '' : l.credit,
                description: l.description,
              })),
            }}
          />
          <ActionButton
            endpoint={`/api/accounting/journals/${entry.id}`}
            method="DELETE"
            variant="destructive"
            label={t('s15Accounting.journals.delete')}
            doneText={t('s15Accounting.accounts.done')}
          />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {entry.entryDate} | {entry.total} USD
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('s15Accounting.journals.lines')}</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="py-1 pr-2">
                      {t('s15Accounting.common.account')}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {t('s15Accounting.common.debit')}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {t('s15Accounting.common.credit')}
                    </th>
                    <th scope="col" className="py-1">
                      {t('s15Accounting.common.description')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((l) => (
                    <tr key={l.lineNo} className="border-t">
                      <td className="py-1 pr-2">
                        {l.accountCode} {l.accountName}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {l.debit === '0.0000' ? '' : l.debit}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {l.credit === '0.0000' ? '' : l.credit}
                      </td>
                      <td className="py-1">{l.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entry.note ? <p className="text-sm text-muted-foreground">{entry.note}</p> : null}
            {entry.reversedById ? (
              <p className="text-sm">
                {t('s15Accounting.journals.reversedBy')}{' '}
                <Link className="underline" href={`/accounting/journals/${entry.reversedById}`}>
                  {t('s15Accounting.journals.detailTitle')}
                </Link>
              </p>
            ) : null}
            {entry.reversesId ? (
              <p className="text-sm">
                {t('s15Accounting.journals.reverses')}{' '}
                <Link className="underline" href={`/accounting/journals/${entry.reversesId}`}>
                  {t('s15Accounting.journals.detailTitle')}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
      {entry.status === 'pending_approval' && canPost ? (
        <div className="flex flex-wrap gap-sp-8">
          <ActionButton
            endpoint={`/api/accounting/journals/${entry.id}/decide`}
            body={{ decision: 'approve', reason: '' }}
            variant="default"
            label={t('s15Accounting.journals.approve')}
            doneText={t('s15Accounting.accounts.done')}
          />
          <ActionButton
            endpoint={`/api/accounting/journals/${entry.id}/decide`}
            body={{ decision: 'reject', reason: 'Rejected' }}
            label={t('s15Accounting.journals.reject')}
            doneText={t('s15Accounting.accounts.done')}
          />
        </div>
      ) : null}
      {entry.status === 'posted' &&
      !entry.reversedById &&
      entry.source !== 'reversal' &&
      canPost ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Accounting.journals.reverse')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint={`/api/accounting/journals/${entry.id}/reverse`}
              idempotent
              submitLabel={t('s15Accounting.journals.reverse')}
              doneText={t('s15Accounting.journals.reversed')}
              fields={[
                {
                  name: 'date',
                  label: t('s15Accounting.journals.reverseDate'),
                  initial: today,
                  required: true,
                },
                {
                  name: 'reason',
                  label: t('s15Accounting.journals.reverseReason'),
                  required: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.journals.attachments')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-8">
          {entry.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('s15Accounting.journals.noAttachments')}
            </p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {entry.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    className="underline"
                    href={`/api/accounting/journals/attachments/${a.id}/file`}
                  >
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {canCreate ? <AttachmentForm entryId={entry.id} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
