// path: components/crm/activity-panel.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';
import type { ActivityItem } from '@/services/client/activity';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const KINDS = ['note', 'call', 'meeting', 'email'] as const;

export function ActivityPanel({
  clientId,
  items,
  canAdd,
}: {
  clientId: string;
  items: ActivityItem[];
  canAdd: boolean;
}): JSX.Element {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, title, body }),
      });
      if (response.ok) {
        setTitle('');
        setBody('');
        setNote({ ok: true, text: t('s08Crm.activity.saved') });
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.activity.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.activity.error') });
    }
    setBusy(false);
  }

  const kindLabel = (k: string): string => {
    const key = `s08Crm.activity.${k}` as StringKey;
    const text = t(key);
    return text === key ? k : text;
  };

  return (
    <section className="space-y-sp-12" aria-label={t('s08Crm.activity.title')}>
      <h2 className="text-h4 font-semibold">{t('s08Crm.activity.title')}</h2>
      {canAdd ? (
        <form
          className="space-y-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="grid gap-sp-8 sm:grid-cols-3">
            <label>
              <span className="block font-medium">{t('s08Crm.activity.kind')}</span>
              <NativeSelect
                value={kind}
                onChange={(e) => setKind(KINDS.find((k) => k === e.target.value) ?? 'note')}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="sm:col-span-2">
              <span className="block font-medium">{t('s08Crm.activity.titleLabel')}</span>
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="block font-medium">{t('s08Crm.activity.body')}</span>
            <Textarea
              rows={3}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || (title.trim() === '' && body.trim() === '')}>
            {t('s08Crm.activity.save')}
          </Button>
          {note ? (
            <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
              {note.text}
            </p>
          ) : null}
        </form>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s08Crm.activity.empty')}</p>
      ) : (
        <ol className="space-y-sp-8">
          {items.map((i, n) => (
            <li key={`${i.id ?? 'ext'}-${n}`} className="rounded-lg border bg-card p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8 text-muted-foreground">
                <span className="flex items-center gap-sp-8">
                  <Badge variant="outline">{kindLabel(i.kind)}</Badge>
                  {i.author}
                </span>
                <time>{i.at.replace('T', ' ').slice(0, 16)} UTC</time>
              </div>
              {i.title ? (
                <p className="mt-1 font-medium">
                  {i.href ? (
                    <Link className="underline" href={i.href}>
                      {i.title}
                    </Link>
                  ) : (
                    i.title
                  )}
                </p>
              ) : null}
              {i.detail ? <p className="whitespace-pre-wrap break-words">{i.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
