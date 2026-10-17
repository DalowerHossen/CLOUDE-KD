// path: app/(dashboard)/projects/new/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BLANK_PROJECT, ProjectForm } from '@/components/project/project-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New project' };

export default async function NewProjectPage(): Promise<JSX.Element> {
  await requirePagePermission('project.manage', 'tenant', 'project');
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s09Projects.createTitle')}
        actions={
          <Link className="underline" href="/projects">
            {t('s09Projects.back')}
          </Link>
        }
      />
      <ProjectForm
        projectId={null}
        version={0}
        initial={BLANK_PROJECT}
        clientName=""
        canDelete={false}
      />
    </div>
  );
}
