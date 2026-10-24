// path: components/project/project-team.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: 'manager' | 'member';
  rate: string | null;
}

export interface MilestoneItem {
  id: string;
  name: string;
  dueDate: string | null;
  amount: string | null;
  status: 'open' | 'done' | 'billed';
}

export function ProjectTeam({
  projectId,
  members,
  people,
  canManage,
}: {
  projectId: string;
  members: TeamMember[];
  people: { userId: string; name: string; email: string }[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'manager' | 'member'>('member');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'PUT' | 'DELETE', body: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await callJson(`/api/projects/${projectId}/members`, method, body);
    if (r.ok) router.refresh();
    else setError(r.message ?? t('s09Projects.form.error'));
    setBusy(false);
  }

  return (
    <section className="space-y-sp-8 text-sm">
      <h2 className="text-lg font-semibold">{t('s09Projects.team.title')}</h2>
      {members.length === 0 ? (
        <p className="text-muted-foreground">{t('s09Projects.team.none')}</p>
      ) : (
        <ul className="space-y-sp-4">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-sp-8">
              <span>
                {m.name || m.email} -{' '}
                {t(m.role === 'manager' ? 's09Projects.team.manager' : 's09Projects.team.member')}
                {m.rate ? ` - ${formatMoney(Money.parse(m.rate))}/h` : ''}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void call('DELETE', { userId: m.userId })}
                >
                  {t('s09Projects.team.remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void call('PUT', { userId, role, rate: rate.trim() === '' ? null : rate.trim() });
          }}
        >
          <label>
            {t('s09Projects.team.person')}
            <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">{t('s09Projects.team.choose')}</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name || p.email}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {t('s09Projects.team.role')}
            <NativeSelect
              value={role}
              onChange={(e) => setRole(e.target.value === 'manager' ? 'manager' : 'member')}
            >
              <option value="member">{t('s09Projects.team.member')}</option>
              <option value="manager">{t('s09Projects.team.manager')}</option>
            </NativeSelect>
          </label>
          <label>
            {t('s09Projects.team.rate')}
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || userId === ''}>
            {t('s09Projects.team.add')}
          </Button>
        </form>
      ) : null}
      {canManage ? <p className="text-muted-foreground">{t('s09Projects.team.rateHelp')}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function ProjectMilestones({
  projectId,
  milestones,
  canManage,
}: {
  projectId: string;
  milestones: MilestoneItem[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await callJson(url, method, body);
    if (r.ok) {
      setName('');
      setDue('');
      setAmount('');
      router.refresh();
    } else setError(r.message ?? t('s09Projects.form.error'));
    setBusy(false);
  }

  return (
    <section className="space-y-sp-8 text-sm">
      <h2 className="text-lg font-semibold">{t('s09Projects.milestones.title')}</h2>
      {milestones.length === 0 ? (
        <p className="text-muted-foreground">{t('s09Projects.milestones.none')}</p>
      ) : (
        <ul className="space-y-sp-4">
          {milestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-sp-8">
              <span>
                {m.name}
                {m.dueDate ? ` - ${m.dueDate}` : ''}
                {m.amount ? ` - ${formatMoney(Money.parse(m.amount))}` : ''} -{' '}
                {t(`s09Projects.milestones.${m.status}`)}
              </span>
              {canManage && m.status !== 'billed' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void call(`/api/projects/${projectId}/milestones/${m.id}`, 'PUT', {
                        name: m.name,
                        dueDate: m.dueDate,
                        amount: m.amount,
                        status: m.status === 'open' ? 'done' : 'open',
                      })
                    }
                  >
                    {m.status === 'open'
                      ? t('s09Projects.milestones.done')
                      : t('s09Projects.milestones.open')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void call(`/api/projects/${projectId}/milestones/${m.id}`, 'DELETE')
                    }
                  >
                    {t('s09Projects.milestones.remove')}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void call(`/api/projects/${projectId}/milestones`, 'POST', {
              name: name.trim(),
              dueDate: due === '' ? null : due,
              amount: amount.trim() === '' ? null : amount.trim(),
              status: 'open',
            });
          }}
        >
          <label>
            {t('s09Projects.milestones.name')}
            <Input
              required
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {t('s09Projects.milestones.due')}
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label>
            {t('s09Projects.milestones.amount')}
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || name.trim() === ''}>
            {t('s09Projects.milestones.add')}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
