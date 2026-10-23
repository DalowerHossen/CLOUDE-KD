// path: app/(admin)/admin/payouts/_components/queue-actions.tsx
'use client';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { t } from '@/lib/i18n';

/** What the platform team does with a payout that is being paid: confirm it with the bank reference, or report it failed. */
export function QueueActions({ id, status }: { id: string; status: string }): JSX.Element | null {
  if (status === 'paid')
    return (
      <JsonForm
        endpoint={`/api/payouts/${id}/reverse`}
        submitLabel={t('s14Wallet.admin.reverse')}
        doneText={t('s14Wallet.common.saved')}
        fields={[{ name: 'reason', label: t('s14Wallet.admin.reason'), required: true }]}
      />
    );
  if (status !== 'processing') return null;
  return (
    <div className="space-y-sp-12">
      <JsonForm
        endpoint={`/api/payouts/${id}/paid`}
        submitLabel={t('s14Wallet.admin.markPaid')}
        doneText={t('s14Wallet.admin.paidDone')}
        fields={[{ name: 'reference', label: t('s14Wallet.admin.reference'), required: true }]}
      />
      <JsonForm
        endpoint={`/api/payouts/${id}/failed`}
        submitLabel={t('s14Wallet.admin.markFailed')}
        doneText={t('s14Wallet.admin.failedDone')}
        fields={[
          { name: 'reason', label: t('s14Wallet.admin.reason'), required: true },
          { name: 'final', label: t('s14Wallet.admin.finalFail'), kind: 'checkbox' },
        ]}
      />
    </div>
  );
}
