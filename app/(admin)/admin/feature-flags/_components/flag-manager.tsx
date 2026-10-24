// path: app/(admin)/admin/feature-flags/_components/flag-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FlagView } from '@/services/company/flags';
import { t } from '@/lib/i18n';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s07Company.adminOps.${k}` as never);

interface Draft {
  key: string;
  companyId: string;
  enabled: boolean;
  rolloutPercent: number;
  version: number | null;
}
const blank: Draft = { key: '', companyId: '', enabled: false, rolloutPercent: 100, version: null };

export function FlagManager({
  flags,
  canManage,
}: {
  flags: FlagView[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blank);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: Draft): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/companies/admin/flags', 'PUT', {
      key: next.key,
      companyId: next.companyId.trim() === '' ? null : next.companyId.trim(),
      enabled: next.enabled,
      rolloutPercent: next.rolloutPercent,
      version: next.version,
    });
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('done') });
      setDraft(blank);
      router.refresh();
    }
  }

  return (
    <div className="space-y-sp-16">
      {canManage ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <div className="grid gap-sp-8 sm:grid-cols-4">
            <label className="text-sm">
              <span className="block font-medium">{p('flagKey')}</span>
              <Input
                value={draft.key}
                maxLength={80}
                readOnly={draft.version !== null}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="block font-medium">{p('flagCompany')}</span>
              <Input
                value={draft.companyId}
                maxLength={36}
                readOnly={draft.version !== null}
                onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium">{p('flagRollout')}</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.rolloutPercent}
                onChange={(e) => setDraft({ ...draft, rolloutPercent: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="flex items-center gap-sp-8 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            {p('flagEnabled')}
          </label>
          <Button type="button" disabled={!draft.key.trim()} onClick={() => void save(draft)}>
            {p('flagSave')}
          </Button>
        </section>
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p('flagEmpty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {flags.map((f) => (
            <li
              key={`${f.key}-${f.companyId ?? 'all'}`}
              className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
            >
              <div className="min-w-0">
                <p className="break-all font-medium">{f.key}</p>
                <p className="text-muted-foreground">
                  {f.companyId ? f.companyName || f.companyId : p('flagGlobal')} -{' '}
                  {f.rolloutPercent}%
                </p>
              </div>
              <div className="flex items-center gap-sp-8">
                <Badge variant="outline">{f.enabled ? p('flagEnabled') : '-'}</Badge>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        key: f.key,
                        companyId: f.companyId ?? '',
                        enabled: f.enabled,
                        rolloutPercent: f.rolloutPercent,
                        version: f.version,
                      })
                    }
                  >
                    {p('flagEdit')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
