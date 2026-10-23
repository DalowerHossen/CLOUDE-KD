// path: components/admin/approvals/approvals-page-body.tsx
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';
import type { ApprovalListPage } from '@/services/approval/queries';
import { ApprovalQueue } from './approval-queue';
import { DelegationForm } from './delegation-form';

interface Props {
  page: ApprovalListPage | null;
  apiBase: string;
  basePath: string;
  status: string | undefined;
  extra?: JSX.Element | null;
  /** Owner, CEO and super admin may delegate. */
  canDelegate?: boolean;
}

const STATUSES = ['pending', 'escalated', 'approved', 'rejected', 'expired'] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], StringKey> = {
  pending: 's02Governance.approvals.statusPending',
  escalated: 's02Governance.approvals.statusEscalated',
  approved: 's02Governance.approvals.statusApproved',
  rejected: 's02Governance.approvals.statusRejected',
  expired: 's02Governance.approvals.statusExpired',
};

export function ApprovalsPageBody({
  page,
  apiBase,
  basePath,
  status,
  extra,
  canDelegate = false,
}: Props): JSX.Element {
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s02Governance.approvals.title')}
        description={t('s02Governance.approvals.description')}
      />
      <nav aria-label={t('s02Governance.approvals.filterStatus')} className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={status ? 'outline' : 'default'}>
          <Link href={basePath}>{t('s02Governance.approvals.filterAll')}</Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild size="sm" variant={status === s ? 'default' : 'outline'}>
            <Link href={`${basePath}?status=${s}`}>{t(STATUS_LABEL[s])}</Link>
          </Button>
        ))}
      </nav>
      {extra ?? null}
      {canDelegate ? <DelegationForm apiBase={apiBase} /> : null}
      {page === null ? (
        <ErrorState description={t('s02Governance.approvals.loadError')} />
      ) : page.items.length === 0 ? (
        <EmptyState
          title={t('s02Governance.approvals.emptyTitle')}
          description={t('s02Governance.approvals.emptyBody')}
        />
      ) : (
        <>
          <ApprovalQueue items={page.items} apiBase={apiBase} />
          {page.nextCursor ? (
            <Button asChild variant="outline">
              <Link
                href={`${basePath}?${status ? `status=${status}&` : ''}cursor=${page.nextCursor}`}
              >
                {t('s02Governance.approvals.olderLabel')}
              </Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
