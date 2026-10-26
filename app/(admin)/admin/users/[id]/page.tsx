// path: app/(admin)/admin/users/[id]/page.tsx
import type { ComponentProps } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { userDetail } from '@/services/company/admin';
import { listPlans } from '@/services/plan/plans';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { PeopleActions } from '../../_components/people-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'User' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const p = (k: string, v?: Record<string, string | number>): string =>
  t(`s07Company.adminPeople.${k}` as never, v);

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('people.read', 'platform', 'user');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const u = await userDetail(id);
  const perms = getService('permissions');
  const canManage =
    (await perms.can(actor, 'people.manage', { type: 'user' })) && u.userId !== actor.userId;
  const canNote = await perms.can(actor, 'people.note', { type: 'user' });
  const suspended = u.status === 'disabled';
  const erased = u.email.startsWith('erased+');
  const isSuper = actor.role === 'super_admin';
  const graceOver =
    u.deletionScheduledFor !== null && new Date(u.deletionScheduledFor) <= new Date();
  const planSlugs =
    isSuper && canManage && u.companyId && !u.platformRole
      ? (await listPlans().catch(() => [])).map((x) => x.slug)
      : null;
  const choices: ComponentProps<typeof PeopleActions>['choices'] = [];
  if (!erased) {
    choices.push(
      suspended
        ? { action: 'user.reactivate', label: p('reactivateUser') }
        : { action: 'user.suspend', label: p('suspendUser') },
    );
    if (!u.platformRole) {
      choices.push(
        { action: 'user.force_password_reset', label: p('forceReset') },
        { action: 'user.reset_2fa', label: p('reset2fa') },
      );
      if (u.deletionScheduledFor === null)
        choices.push({ action: 'user.soft_delete', label: p('softDelete') });
      else if (isSuper && graceOver) choices.push({ action: 'user.purge', label: p('purge') });
    }
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={p('userTitle', { name: u.name || u.email })}
        actions={
          <Link className="underline" href="/admin/users">
            {p('usersTitle')}
          </Link>
        }
      />
      <StepUpForm />
      <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 text-sm sm:grid-cols-2">
        <p>
          <strong>{p('email')}:</strong> {u.email}
        </p>
        <p>
          <strong>{p('role')}:</strong> {u.platformRole ?? u.role}
          {u.subRole ? ` (${u.subRole})` : ''}
        </p>
        <p>
          <strong>{p('status')}:</strong> {u.status}
        </p>
        <p>
          <strong>{p('company')}:</strong>{' '}
          {u.companyId ? (
            <Link className="underline" href={`/admin/tenants/${u.companyId}`}>
              {u.companyName}
            </Link>
          ) : (
            '-'
          )}
        </p>
        <p>
          <strong>{p('sessions')}:</strong> {u.sessions}
        </p>
        <p>
          <strong>{p('joined')}:</strong> {u.createdAt.slice(0, 10)}
        </p>
        {u.deletionScheduledFor ? (
          <p role="status" className="sm:col-span-2">
            {p('deletionScheduled', { date: u.deletionScheduledFor.slice(0, 10) })}
          </p>
        ) : null}
        {erased ? (
          <p role="status" className="sm:col-span-2">
            {p('erased')}
          </p>
        ) : null}
        {u.pendingAction ? (
          <p role="status" className="sm:col-span-2">
            {p('pending', { action: u.pendingAction })}
          </p>
        ) : null}
      </section>
      <PeopleActions
        subject="user"
        id={u.userId}
        canManage={canManage}
        canNote={canNote}
        canVerifyEmail={canManage}
        locked={u.pendingAction !== null}
        choices={choices}
        changeEmail={!erased && !u.platformRole}
        plans={planSlugs}
      />
      {actor.role === 'super_admin' && !u.platformRole && u.email ? (
        <p className="text-sm">
          <Link className="underline" href="/admin/impersonation">
            {p('impersonate')}
          </Link>
        </p>
      ) : null}
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{p('logins')}</h2>
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {u.login.length === 0 ? (
            <li className="p-sp-12 text-muted-foreground">{p('empty')}</li>
          ) : (
            u.login.map((l, i) => (
              <li key={`${l.at}-${i}`} className="flex justify-between gap-sp-12 p-sp-12">
                <span>
                  {l.type} {l.network}
                </span>
                <time className="text-muted-foreground">{l.at.replace('T', ' ').slice(0, 16)}</time>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{p('activity')}</h2>
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {u.activity.length === 0 ? (
            <li className="p-sp-12 text-muted-foreground">{p('empty')}</li>
          ) : (
            u.activity.map((a, i) => (
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
        {u.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('noNotes')}</p>
        ) : (
          <ul className="space-y-sp-8 text-sm">
            {u.notes.map((n) => (
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
