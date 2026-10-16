// path: app/(admin)/admin/seo/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { runAudit, type AuditIssue, type AuditReport } from '@/services/seo/audit';
import { readSeoSettings } from '@/services/seo/settings';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { SettingsForm } from './_components/settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search settings and audit' };

const columns: readonly DataColumn<AuditIssue>[] = [
  {
    key: 'severity',
    header: t('s06Public.seoAdmin.colSeverity'),
    cell: (r) => (
      <Badge variant={r.severity === 'error' ? 'destructive' : 'outline'}>{r.severity}</Badge>
    ),
  },
  { key: 'path', header: t('s06Public.cms.colPage'), primary: true, cell: (r) => r.path },
  { key: 'message', header: t('s06Public.seoAdmin.colProblem'), cell: (r) => r.message },
];

export default async function AdminSeoPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('seo.read', 'platform', 'seo');
  let report: AuditReport | null;
  try {
    report = await runAudit();
  } catch {
    report = null;
  }
  const settings = await readSeoSettings();
  const canEdit = actor.role === 'super_admin' || actor.role === 'ceo';
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s06Public.seoAdmin.title')}
        description={t('s06Public.seoAdmin.description')}
      />
      {report === null ? (
        <ErrorState description={t('s06Public.cms.loadError')} />
      ) : (
        <>
          <section
            className="grid gap-sp-12 sm:grid-cols-4"
            aria-label={t('s06Public.seoAdmin.summary')}
          >
            {[
              [t('s06Public.seoAdmin.score'), `${report.score}/100`],
              [t('s06Public.seoAdmin.pages'), String(report.pagesChecked)],
              [t('s06Public.seoAdmin.errors'), String(report.errors)],
              [t('s06Public.seoAdmin.warnings'), String(report.warnings)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-h3 font-semibold">{value}</CardContent>
              </Card>
            ))}
          </section>
          <DataTable
            columns={columns}
            rows={report.issues}
            getRowId={(r) => `${r.path}-${r.code}-${r.message}`}
            caption={t('s06Public.seoAdmin.issues')}
            empty={<p className="p-sp-16 text-sm">{t('s06Public.seoAdmin.clean')}</p>}
          />
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {t('s06Public.seoAdmin.hideHelp')}{' '}
        <Link className="underline" href="/admin/cms">
          {t('s06Public.cms.title')}
        </Link>
      </p>
      {canEdit ? (
        <section className="space-y-sp-12" aria-labelledby="seo-settings">
          <h2 id="seo-settings" className="text-h3 font-semibold">
            {t('s06Public.seoAdmin.settings')}
          </h2>
          <StepUpForm />
          <SettingsForm initial={settings} />
        </section>
      ) : null}
    </div>
  );
}
