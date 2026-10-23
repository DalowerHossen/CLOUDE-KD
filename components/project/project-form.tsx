// path: components/project/project-form.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import {
  BILLING_TYPES,
  PROJECT_STATUSES,
  type BillingType,
  type ProjectInput,
  type ProjectStatus,
} from '@/lib/project/input';

const idBody = z.object({ id: z.string() });
const clientHits = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

export const BLANK_PROJECT: ProjectInput = {
  name: '',
  code: '',
  description: '',
  clientId: null,
  status: 'active',
  billingType: 'hourly',
  defaultRate: null,
  fixedFee: null,
  retainerHours: null,
  budgetHours: null,
  budgetAmount: null,
  startDate: null,
  endDate: null,
};

const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export function ProjectForm({
  projectId,
  version,
  initial,
  clientName,
  canDelete,
}: {
  projectId: string | null;
  version: number;
  initial: ProjectInput;
  clientName: string;
  canDelete: boolean;
}): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState<ProjectInput>(initial);
  const [client, setClient] = useState(clientName);
  const [hits, setHits] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(crypto.randomUUID());

  async function search(text: string): Promise<void> {
    if (text.trim().length < 2) return setHits(null);
    const r = await fetch(
      `/api/clients?${new URLSearchParams({ q: text.trim() }).toString()}`,
    ).catch(() => null);
    const parsed = clientHits.safeParse(await r?.json().catch(() => null));
    setHits(parsed.success ? parsed.data.data.rows.slice(0, 8) : []);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = projectId
      ? await callJson(`/api/projects/${projectId}`, 'PUT', {
          expectedVersion: version,
          project: v,
        })
      : await callJson('/api/projects', 'POST', v, { 'idempotency-key': key.current });
    if (r.ok) {
      const saved = idBody.safeParse(r.data);
      setNote({ ok: true, text: t('s09Projects.form.saved') });
      if (!projectId && saved.success) router.replace(`/projects/${saved.data.id}`);
      router.refresh();
    } else if (r.status === 409) setNote({ ok: false, text: t('s09Projects.form.conflict') });
    else setNote({ ok: false, text: r.message ?? t('s09Projects.form.error') });
    setBusy(false);
  }

  async function remove(): Promise<void> {
    if (!projectId || !window.confirm(t('s09Projects.form.confirmDelete'))) return;
    setBusy(true);
    const r = await callJson(`/api/projects/${projectId}`, 'DELETE');
    if (r.ok) router.push('/projects');
    else setNote({ ok: false, text: r.message ?? t('s09Projects.form.error') });
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-16 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label>
          {t('s09Projects.form.name')}
          <Input
            required
            maxLength={150}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </label>
        <label>
          {t('s09Projects.form.code')}
          <Input
            maxLength={20}
            value={v.code}
            onChange={(e) => setV({ ...v, code: e.target.value })}
          />
        </label>
        <label>
          {t('s09Projects.form.status')}
          <NativeSelect
            value={v.status}
            onChange={(e) =>
              setV({ ...v, status: PROJECT_STATUSES.find((s) => s === e.target.value) ?? 'active' })
            }
          >
            {PROJECT_STATUSES.map((s: ProjectStatus) => (
              <option key={s} value={s}>
                {t(`s09Projects.statuses.${s}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          {t('s09Projects.form.billingType')}
          <NativeSelect
            value={v.billingType}
            onChange={(e) =>
              setV({
                ...v,
                billingType: BILLING_TYPES.find((b) => b === e.target.value) ?? 'hourly',
              })
            }
          >
            {BILLING_TYPES.map((b: BillingType) => (
              <option key={b} value={b}>
                {t(`s09Projects.billing.${b}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="space-y-sp-4">
        <span className="block">{t('s09Projects.form.client')}</span>
        {v.clientId ? (
          <p>
            {client}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => setV({ ...v, clientId: null })}
            >
              {t('s09Projects.form.chooseClient')}
            </button>
          </p>
        ) : (
          <>
            <Input
              maxLength={80}
              placeholder={t('s09Projects.form.searchClient')}
              onChange={(e) => void search(e.target.value)}
            />
            {hits ? (
              <ul className="rounded-lg border">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full px-sp-8 py-sp-4 text-left hover:bg-muted"
                      onClick={() => {
                        setV({ ...v, clientId: h.id });
                        setClient(h.name);
                        setHits(null);
                      }}
                    >
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        {v.billingType === 'hourly' || v.billingType === 'retainer' ? (
          <label>
            {t('s09Projects.form.defaultRate')}
            <Input
              inputMode="decimal"
              value={v.defaultRate ?? ''}
              onChange={(e) => setV({ ...v, defaultRate: orNull(e.target.value) })}
            />
          </label>
        ) : null}
        {v.billingType === 'fixed' || v.billingType === 'retainer' ? (
          <label>
            {t('s09Projects.form.fixedFee')}
            <Input
              inputMode="decimal"
              value={v.fixedFee ?? ''}
              onChange={(e) => setV({ ...v, fixedFee: orNull(e.target.value) })}
            />
          </label>
        ) : null}
        {v.billingType === 'retainer' ? (
          <label>
            {t('s09Projects.form.retainerHours')}
            <Input
              inputMode="decimal"
              value={v.retainerHours ?? ''}
              onChange={(e) => setV({ ...v, retainerHours: orNull(e.target.value) })}
            />
          </label>
        ) : null}
        <label>
          {t('s09Projects.form.budgetHours')}
          <Input
            inputMode="decimal"
            value={v.budgetHours ?? ''}
            onChange={(e) => setV({ ...v, budgetHours: orNull(e.target.value) })}
          />
        </label>
        <label>
          {t('s09Projects.form.budgetAmount')}
          <Input
            inputMode="decimal"
            value={v.budgetAmount ?? ''}
            onChange={(e) => setV({ ...v, budgetAmount: orNull(e.target.value) })}
          />
        </label>
        <label>
          {t('s09Projects.form.startDate')}
          <Input
            type="date"
            value={v.startDate ?? ''}
            onChange={(e) => setV({ ...v, startDate: orNull(e.target.value) })}
          />
        </label>
        <label>
          {t('s09Projects.form.endDate')}
          <Input
            type="date"
            value={v.endDate ?? ''}
            onChange={(e) => setV({ ...v, endDate: orNull(e.target.value) })}
          />
        </label>
      </div>
      <label className="block">
        {t('s09Projects.form.description')}
        <Input
          maxLength={5000}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </label>
      <div className="flex gap-sp-8">
        <Button type="submit" disabled={busy}>
          {busy ? t('s09Projects.form.saving') : t('s09Projects.form.save')}
        </Button>
        {projectId && canDelete ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
            {t('s09Projects.form.delete')}
          </Button>
        ) : null}
      </div>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
