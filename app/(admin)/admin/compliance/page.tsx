// path: app/(admin)/admin/compliance/page.tsx
import type { Metadata } from 'next';
import { DsarActions } from '@/components/admin/compliance/dsar-actions';
import { RetentionEditor } from '@/components/admin/compliance/retention-editor';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { JURISDICTIONS } from '@/lib/compliance/jurisdictions';
import { t } from '@/lib/i18n';
import { listDsar, type DsarItem } from '@/services/compliance/dsar';
import {
  listClassifications,
  listRetention,
  type ClassificationItem,
  type RetentionItem,
} from '@/services/compliance/queries';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compliance' };

interface Loaded {
  dsar: DsarItem[];
  retention: RetentionItem[];
  classification: ClassificationItem[];
}

const dsarColumns: readonly DataColumn<DsarItem>[] = [
  {
    key: 'type',
    header: t('s02Governance.compliance.colType'),
    primary: true,
    cell: (r) => r.requestType,
  },
  {
    key: 'subject',
    header: t('s02Governance.compliance.colSubject'),
    cell: (r) => <span className="break-all font-mono text-xs">{r.subjectUserId ?? '-'}</span>,
  },
  {
    key: 'jurisdiction',
    header: t('s02Governance.compliance.colJurisdiction'),
    cell: (r) => r.jurisdiction,
  },
  {
    key: 'due',
    header: t('s02Governance.compliance.colDue'),
    cell: (r) => (
      <span>
        <time dateTime={r.dueAt}>{r.dueAt.slice(0, 10)}</time>{' '}
        {r.overdue ? (
          <Badge variant="destructive">{t('s02Governance.compliance.overdue')}</Badge>
        ) : null}
      </span>
    ),
  },
  {
    key: 'status',
    header: t('s02Governance.compliance.colStatus'),
    cell: (r) => <Badge variant="outline">{r.status}</Badge>,
  },
  {
    key: 'certificate',
    header: t('s02Governance.compliance.colCertificate'),
    hideOnMobile: true,
    cell: (r) => (
      <span className="break-all font-mono text-xs">
        {r.certificateHash ? r.certificateHash.slice(0, 16) : '-'}
      </span>
    ),
  },
  {
    key: 'actions',
    header: t('s02Governance.compliance.colActions'),
    cell: (r) => <DsarActions id={r.id} requestType={r.requestType} status={r.status} />,
  },
];

const retentionColumns: readonly DataColumn<RetentionItem>[] = [
  {
    key: 'type',
    header: t('s02Governance.compliance.colDataType'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.dataType}</span>,
  },
  {
    key: 'jurisdiction',
    header: t('s02Governance.compliance.colJurisdiction'),
    cell: (r) => r.jurisdiction,
  },
  { key: 'action', header: t('s02Governance.compliance.colAction'), cell: (r) => r.action },
  {
    key: 'basis',
    header: t('s02Governance.compliance.colBasis'),
    hideOnMobile: true,
    cell: (r) => r.legalBasis,
  },
  {
    key: 'days',
    header: t('s02Governance.compliance.colDays'),
    cell: (r) => (
      <RetentionEditor
        dataType={r.dataType}
        jurisdiction={r.jurisdiction}
        days={r.retentionDays}
        action={r.action}
        legalBasis={r.legalBasis}
        enabled={r.enabled}
        version={r.version}
      />
    ),
  },
];

const classColumns: readonly DataColumn<ClassificationItem>[] = [
  {
    key: 'table',
    header: t('s02Governance.compliance.colTable'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.tableName}</span>,
  },
  {
    key: 'column',
    header: t('s02Governance.compliance.colColumn'),
    cell: (r) => <span className="font-mono text-sm">{r.columnName}</span>,
  },
  {
    key: 'class',
    header: t('s02Governance.compliance.colClass'),
    cell: (r) => <Badge variant="outline">{r.classification}</Badge>,
  },
  {
    key: 'pii',
    header: t('s02Governance.compliance.colPii'),
    cell: (r) =>
      r.containsPii ? t('s02Governance.compliance.yes') : t('s02Governance.compliance.no'),
  },
  {
    key: 'origin',
    header: t('s02Governance.compliance.colOrigin'),
    hideOnMobile: true,
    cell: (r) => r.origin,
  },
];

const jurisdictionColumns: readonly DataColumn<(typeof JURISDICTIONS)[number]>[] = [
  {
    key: 'code',
    header: t('s02Governance.compliance.colJurisdiction'),
    primary: true,
    cell: (r) => r.code,
  },
  { key: 'law', header: t('s02Governance.compliance.colLaw'), cell: (r) => r.law },
  { key: 'days', header: t('s02Governance.compliance.colDeadline'), cell: (r) => r.dsarDays },
  { key: 'region', header: t('s02Governance.compliance.colRegion'), cell: (r) => r.defaultRegion },
];

export default async function CompliancePage(): Promise<JSX.Element> {
  await requirePagePermission('compliance.read', 'platform', 'compliance');
  let loaded: Loaded | null = null;
  try {
    const [dsar, retention, classification] = await Promise.all([
      listDsar(),
      listRetention(),
      listClassifications(),
    ]);
    loaded = { dsar, retention, classification };
  } catch {
    loaded = null;
  }
  return (
    <div className="space-y-sp-32">
      <PageHeader
        title={t('s02Governance.compliance.title')}
        description={t('s02Governance.compliance.description')}
      />
      {loaded === null ? (
        <ErrorState description={t('s02Governance.compliance.loadError')} />
      ) : (
        <>
          <section aria-labelledby="dsar-title" className="space-y-sp-12">
            <h2 id="dsar-title" className="text-h3 font-semibold">
              {t('s02Governance.compliance.dsarTitle')}
            </h2>
            <DataTable
              columns={dsarColumns}
              rows={loaded.dsar}
              getRowId={(r) => r.id}
              caption={t('s02Governance.compliance.dsarCaption')}
              empty={
                <EmptyState
                  title={t('s02Governance.compliance.dsarEmptyTitle')}
                  description={t('s02Governance.compliance.dsarEmptyBody')}
                />
              }
            />
          </section>
          <section aria-labelledby="ret-title" className="space-y-sp-12">
            <h2 id="ret-title" className="text-h3 font-semibold">
              {t('s02Governance.compliance.retentionTitle')}
            </h2>
            <DataTable
              columns={retentionColumns}
              rows={loaded.retention}
              getRowId={(r) => r.id}
              caption={t('s02Governance.compliance.retentionCaption')}
            />
          </section>
          <section aria-labelledby="class-title" className="space-y-sp-12">
            <h2 id="class-title" className="text-h3 font-semibold">
              {t('s02Governance.compliance.classificationTitle')}
            </h2>
            <DataTable
              columns={classColumns}
              rows={loaded.classification}
              getRowId={(r) => r.id}
              caption={t('s02Governance.compliance.classificationCaption')}
            />
          </section>
        </>
      )}
      <section aria-labelledby="jur-title" className="space-y-sp-12">
        <h2 id="jur-title" className="text-h3 font-semibold">
          {t('s02Governance.compliance.jurisdictionTitle')}
        </h2>
        <DataTable
          columns={jurisdictionColumns}
          rows={JURISDICTIONS}
          getRowId={(r) => r.code}
          caption={t('s02Governance.compliance.jurisdictionCaption')}
        />
      </section>
    </div>
  );
}
