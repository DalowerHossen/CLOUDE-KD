// path: app/(admin)/admin/tenants/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { MODULES } from '@/config/features';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { tenantDetail } from '@/services/company/admin';
import { listFlags, type FlagView } from '@/services/company/flags';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { ModulesPanel } from '../../_components/modules-panel';
import { PeopleActions } from '../../_components/people-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Company' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const p = (k: string, v?: Record<string, string | number>): string =>
  t(`s07Company.adminPeople.${k}` as never, v);

export default async function TenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('people.read', 'platform', 'tenant');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const c = await tenantDetail(id);
  const perms = getService('permissions');
  const canManage = await perms.can(actor, 'people.manage', { type: 'tenant' });
  const canNote = await perms.can(actor, 'people.note', { type: 'tenant' });
  const canFlags = await perms.can(actor, 'flags.manage', { type: 'feature_flag' });
  let flags: FlagView[] = [];
  try {
    flags = (await listFlags()).filter(
      (f) => f.key.startsWith('module.') && (f.companyId === null || f.companyId === c.id),
    );
  } catch {
    flags = [];
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={p('tenantTitle', { name: c.name })}
        actions={
          <Link className="underline" href="/admin/tenants">
            {p('tenantsTitle')}
          </Link>
        }
      />
      <StepUpForm />
      <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 text-sm sm:grid-cols-2">
        <p>
          <strong>{p('company')}:</strong> {c.slug}
        </p>
        <p>
          <strong>{p('status')}:</strong> {c.status}
        </p>
        <p>
          <strong>{p('plan')}:</strong> {c.plan}
        </p>
        <p>
          <strong>{p('country')}:</strong> {c.country ?? '-'}
        </p>
        <p>
          <strong>{p('kyc')}:</strong> {c.kyc}
        </p>
        <p>
          <strong>{p('domains')}:</strong> {c.domains}
        </p>
        <p>
          <strong>{p('storage')}:</strong> {c.storageProvider}
        </p>
        <p>
          <strong>{p('joined')}:</strong> {c.createdAt.slice(0, 10)}
        </p>
        {c.pendingAction ? (
          <p role="status" className="sm:col-span-2">
            {p('pending', { action: c.pendingAction })}
          </p>
        ) : null}
      </section>
      <ModulesPanel modules={MODULES} flags={flags} companyId={c.id} canManage={canFlags} />
      <PeopleActions
        subject="tenant"
        id={c.id}
        canManage={canManage && c.status !== 'closed'}
        canNote={canNote}
        canVerifyEmail={false}
        locked={c.pendingAction !== null}
        choices={[
          c.status === 'suspended'
            ? { action: 'tenant.reactivate', label: p('reactivateTenant') }
            : { action: 'tenant.suspend', label: p('suspendTenant') },
        ]}
      />
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{p('members')}</h2>
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {c.members.map((m) => (
            <li key={m.userId} className="flex justify-between gap-sp-12 p-sp-12">
              <Link className="underline" href={`/admin/users/${m.userId}`}>
                {m.name || m.email}
              </Link>
              <span className="text-muted-foreground">
                {m.role} / {m.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{p('activity')}</h2>
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {c.activity.length === 0 ? (
            <li className="p-sp-12 text-muted-foreground">{p('empty')}</li>
          ) : (
            c.activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex justify-between gap-sp-12 p-sp-12">
                <span>{a.action}</span>
                <time className="text-muted-foreground">{a.at.replace('T', ' ').slice(0, 16)}</time>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{p('notes')}</h2>
        {c.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('noNotes')}</p>
        ) : (
          <ul className="space-y-sp-8 text-sm">
            {c.notes.map((n) => (
              <li key={n.id} className="rounded-lg border bg-card p-sp-12">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <time className="text-muted-foreground">{n.at.replace('T', ' ').slice(0, 16)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
