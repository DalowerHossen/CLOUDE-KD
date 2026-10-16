// path: app/(admin)/admin/blog/_components/post-editor.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { SafeHtml } from '@/components/shared/safe-html';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/lib/blog/text';
import { t } from '@/lib/i18n';
import { MediaPicker } from '../../cms/_components/media-picker';
import { RichEditor } from './rich-editor';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const savedBody = z.object({ data: z.object({ id: z.string().uuid() }) });

export interface PostEditorProps {
  post: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    bodyHtml: string;
    coverFileId: string | null;
    coverAlt: string;
    authorId: string;
    categoryId: string | null;
    status: string;
    featured: boolean;
    seoTitle: string;
    seoDescription: string;
    version: number;
    viewCount: number;
  } | null;
  tagIds: string[];
  authors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  history: { versionNo: number; title: string; createdAt: string }[];
  canPublishDirect: boolean;
}

export function PostEditor(props: PostEditorProps): JSX.Element {
  const router = useRouter();
  const p = props.post;
  const [title, setTitle] = useState(p?.title ?? '');
  const [slug, setSlug] = useState(p?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(p !== null);
  const [excerpt, setExcerpt] = useState(p?.excerpt ?? '');
  const [bodyHtml, setBodyHtml] = useState(p?.bodyHtml ?? '');
  const [coverFileId, setCoverFileId] = useState<string | null>(p?.coverFileId ?? null);
  const [coverAlt, setCoverAlt] = useState(p?.coverAlt ?? '');
  const [authorId, setAuthorId] = useState(p?.authorId ?? props.authors[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? '');
  const [tagIds, setTagIds] = useState<string[]>(props.tagIds);
  const [featured, setFeatured] = useState(p?.featured ?? false);
  const [seoTitle, setSeoTitle] = useState(p?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(p?.seoDescription ?? '');
  const [publishAt, setPublishAt] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = p?.status ?? 'draft';
  const locked = status === 'pending_approval' || status === 'scheduled';

  async function send(url: string, body: unknown, ok: string): Promise<unknown> {
    setBusy(true);
    setMessage(t('s06Public.blogAdmin.working'));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setMessage(ok);
        router.refresh();
        return json ?? {};
      }
      const parsed = errorBody.safeParse(json);
      setMessage(parsed.success ? parsed.data.error.message : t('s06Public.blogAdmin.error'));
    } catch {
      setMessage(t('s06Public.blogAdmin.error'));
    } finally {
      setBusy(false);
    }
    return null;
  }

  async function save(): Promise<string | null> {
    const result = await send(
      '/api/blog/save',
      {
        id: p?.id ?? null,
        expectedVersion: p?.version ?? null,
        slug,
        title,
        excerpt,
        bodyHtml,
        coverFileId,
        coverAlt,
        authorId,
        categoryId: categoryId || null,
        tagIds,
        featured,
        seoTitle,
        seoDescription,
      },
      t('s06Public.blogAdmin.saved'),
    );
    const parsed = savedBody.safeParse(result);
    if (!parsed.success) return null;
    if (!p) router.replace(`/admin/blog/${parsed.data.data.id}`);
    return parsed.data.data.id;
  }

  async function act(body: Record<string, unknown>): Promise<void> {
    if (!p) return;
    await send('/api/blog/action', { ...body, id: p.id }, t('s06Public.blogAdmin.done'));
  }

  async function publish(): Promise<void> {
    const id = await save();
    if (!id) return;
    const at = publishAt ? new Date(publishAt).toISOString() : null;
    await send(
      '/api/blog/action',
      { action: 'publish', id, publishAt: at },
      t('s06Public.blogAdmin.done'),
    );
  }

  return (
    <div className="space-y-sp-24">
      <p className="text-sm text-muted-foreground">
        <Badge variant="outline">{status}</Badge>{' '}
        {props.canPublishDirect ? t('s06Public.cms.directNote') : t('s06Public.cms.approvalNote')}
        {p ? ` ${t('s06Public.blogAdmin.views', { count: p.viewCount })}` : ''}
      </p>
      {locked ? (
        <Alert>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act({ action: 'cancel' })}
          >
            {t('s06Public.cms.callBack')}
          </Button>
        </Alert>
      ) : null}
      <fieldset disabled={locked || busy} className="space-y-sp-16">
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.postTitle')}</span>
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.slug')}</span>
          <Input
            value={slug}
            maxLength={80}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.excerpt')}</span>
          <Textarea
            value={excerpt}
            rows={2}
            maxLength={300}
            onChange={(e) => setExcerpt(e.target.value)}
          />
        </label>
        <div className="space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.cover')}</span>
          <MediaPicker value={coverFileId ?? ''} onChange={setCoverFileId} />
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.coverAlt')}</span>
          <Input value={coverAlt} maxLength={160} onChange={(e) => setCoverAlt(e.target.value)} />
        </label>
        <div className="grid gap-sp-12 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>{t('s06Public.blogAdmin.author')}</span>
            <NativeSelect value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
              {props.authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s06Public.blogAdmin.category')}</span>
            <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('s06Public.blogAdmin.noCategory')}</option>
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <fieldset className="space-y-1 text-sm">
          <legend>{t('s06Public.blogAdmin.tags')}</legend>
          <div className="flex flex-wrap gap-sp-12">
            {props.tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={(e) =>
                    setTagIds(
                      e.target.checked
                        ? [...tagIds, tag.id].slice(0, 10)
                        : tagIds.filter((x) => x !== tag.id),
                    )
                  }
                />
                {tag.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
          <span>{t('s06Public.blogAdmin.featured')}</span>
        </label>
        <RichEditor value={bodyHtml} onChange={setBodyHtml} disabled={locked} />
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.seoTitle')}</span>
          <Input value={seoTitle} maxLength={70} onChange={(e) => setSeoTitle(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.blogAdmin.seoDescription')}</span>
          <Textarea
            value={seoDescription}
            rows={2}
            maxLength={170}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" onClick={() => void save()}>
            {t('s06Public.cms.save')}
          </Button>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.cms.publishAt')}</span>
            <Input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={status !== 'draft'}
            onClick={() => void publish()}
          >
            {publishAt ? t('s06Public.cms.schedule') : t('s06Public.cms.publishNow')}
          </Button>
          {status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void act({ action: 'unpublish' })}
            >
              {t('s06Public.blogAdmin.unpublish')}
            </Button>
          ) : null}
          {p ? (
            <Button type="button" variant="outline" onClick={() => void act({ action: 'delete' })}>
              {t('s06Public.cms.remove')}
            </Button>
          ) : null}
        </div>
      </fieldset>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
      <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>
        {preview ? t('s06Public.cms.hidePreview') : t('s06Public.cms.showPreview')}
      </Button>
      {preview ? (
        <article className="rounded-lg border p-sp-16">
          <h2 className="text-h2 font-semibold">{title}</h2>
          <SafeHtml html={bodyHtml} className="prose-content mt-sp-12 space-y-sp-12" />
        </article>
      ) : null}
      {props.history.length > 0 ? (
        <section className="space-y-sp-12" aria-labelledby="hist-title">
          <h2 id="hist-title" className="text-h3 font-semibold">
            {t('s06Public.blogAdmin.history')}
          </h2>
          <ul className="divide-y rounded-lg border">
            {props.history.map((h) => (
              <li key={h.versionNo} className="flex flex-wrap items-center gap-2 p-sp-12 text-sm">
                <span>{t('s06Public.cms.version', { no: h.versionNo })}</span>
                <span className="text-muted-foreground">
                  {h.createdAt.replace('T', ' ').slice(0, 16)}
                </span>
                <span>{h.title}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy || status !== 'draft'}
                  onClick={() => void act({ action: 'restore', versionNo: h.versionNo })}
                >
                  {t('s06Public.blogAdmin.restore')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
