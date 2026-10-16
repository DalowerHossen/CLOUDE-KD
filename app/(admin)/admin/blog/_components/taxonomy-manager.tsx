// path: app/(admin)/admin/blog/_components/taxonomy-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { slugify } from '@/lib/blog/text';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
type Kind = 'author' | 'category' | 'tag';

interface Entry {
  id: string;
  name: string;
  slug: string;
}

export function TaxonomyManager({
  kind,
  title,
  entries,
}: {
  kind: Kind;
  title: string;
  entries: Entry[];
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        setName('');
        setExtra('');
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s06Public.blogAdmin.error'));
      }
    } catch {
      setMessage(t('s06Public.blogAdmin.error'));
    } finally {
      setBusy(false);
    }
  }

  function add(): Promise<void> {
    const base = { kind, id: null, slug: slugify(name), name };
    const body =
      kind === 'author'
        ? { ...base, bio: extra, avatarFileId: null }
        : kind === 'category'
          ? { ...base, description: extra }
          : base;
    return call('POST', '/api/blog/taxonomy', body);
  }

  return (
    <section className="space-y-sp-12" aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="space-y-1 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <span>{e.name}</span>
            <span className="text-muted-foreground">{e.slug}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void call('DELETE', `/api/blog/taxonomy?kind=${kind}&id=${e.id}`)}
            >
              {t('s06Public.cms.remove')}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.name')}</span>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        {kind !== 'tag' ? (
          <label className="space-y-1 text-sm">
            <span>
              {kind === 'author'
                ? t('s06Public.blogAdmin.bio')
                : t('s06Public.blogAdmin.categoryDescription')}
            </span>
            <Input value={extra} maxLength={300} onChange={(e) => setExtra(e.target.value)} />
          </label>
        ) : null}
        <Button type="button" disabled={busy || name.trim().length < 2} onClick={() => void add()}>
          {t('s06Public.cms.create')}
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
