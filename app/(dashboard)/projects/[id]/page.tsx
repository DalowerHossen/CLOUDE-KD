// path: app/(dashboard)/projects/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectForm } from '@/components/project/project-form';
import { ProjectMilestones, ProjectTeam } from '@/components/project/project-team';
import { TimesheetEntries, type EntryRow } from '@/components/project/timesheet-entries';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  assignablePeople,
  getProject,
  isManager,
  listMilestones,
  listProjectMembers,
  projectUsage,
  type ProjectView,
} from '@/services/project/projects';
import { listEntries } from '@/services/project/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Project' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('project.read', 'tenant', 'project');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let project: ProjectView;
  try {
    project = await getProject(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [manager, members, milestones, usage, people, entries] = await Promise.all([
    isManager(actor, id),
    listProjectMembers(companyId, id),
    listMilestones(companyId, id),
    projectUsage(companyId, project),
    assignablePeople(companyId),
    listEntries(actor, { projectId: id, limit: 100 }),
  ]);
  const { id: _id, clientName, createdAt: _created, version, ...fields } = project;
  void _id;
  void _created;
  const rows: EntryRow[] = entries.map((e) => ({ ...e, mine: e.userId === actor.userId }));
  return (
    <div className="mx-auto max-w-4xl space-y-sp-24">
      <PageHeader
        title={project.name}
        actions={
          <Link className="underline print:hidden" href="/projects">
            {t('s09Projects.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">{t(`s09Projects.statuses.${project.status}` as StringKey)}</Badge>
        <span>{t(`s09Projects.billing.${project.billingType}` as StringKey)}</span>
        {clientName ? <span>{clientName}</span> : null}
      </div>
      <section className="space-y-sp-4 rounded-lg border bg-card p-sp-12 text-sm">
        <h2 className="text-lg font-semibold">{t('s09Projects.usage.title')}</h2>
        <p>{t('s09Projects.usage.hours', { hours: usage.hours })}</p>
        <p>{t('s09Projects.usage.billable', { hours: usage.billableHours })}</p>
        <p>{t('s09Projects.usage.value', { amount: formatMoney(Money.parse(usage.amount)) })}</p>
        <p>
          {t('s09Projects.usage.unbilled', {
            hours: usage.unbilledHours,
            amount: formatMoney(Money.parse(usage.unbilledAmount)),
          })}
        </p>
        {usage.budget.hoursPercent ? (
          <p>{t('s09Projects.usage.hoursBudget', { percent: usage.budget.hoursPercent })}</p>
        ) : null}
        {usage.budget.amountPercent ? (
          <p>{t('s09Projects.usage.amountBudget', { percent: usage.budget.amountPercent })}</p>
        ) : null}
        {usage.budget.level !== 'ok' ? (
          <p role="status" className="font-medium text-destructive">
            {t(usage.budget.level === 'over' ? 's09Projects.usage.over' : 's09Projects.usage.warn')}
          </p>
        ) : null}
      </section>
      {manager ? (
        <ProjectForm
          projectId={id}
          version={version}
          clientName={clientName}
          canDelete={actor.role === 'owner' || manager}
          initial={{
            name: fields.name,
            code: fields.code,
            description: fields.description,
            clientId: fields.clientId,
            status: fields.status,
            billingType: fields.billingType,
            defaultRate: fields.defaultRate,
            fixedFee: fields.fixedFee,
            retainerHours: fields.retainerHours,
            budgetHours: fields.budgetHours,
            budgetAmount: fields.budgetAmount,
            startDate: fields.startDate,
            endDate: fields.endDate,
          }}
        />
      ) : null}
      <ProjectTeam projectId={id} members={members} people={people} canManage={manager} />
      <ProjectMilestones projectId={id} milestones={milestones} canManage={manager} />
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Projects.time.entries')}</h2>
        <TimesheetEntries entries={rows} approvals={false} showAmounts={manager} />
      </section>
    </div>
  );
}
