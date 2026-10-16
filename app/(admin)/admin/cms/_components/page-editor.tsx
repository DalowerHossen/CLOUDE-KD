// path: app/(admin)/admin/cms/_components/page-editor.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { BlockList } from '@/components/marketing/blocks/block-view';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { pageContentSchema } from '@/lib/cms/blocks';
import { BLOCK_LABELS, OPTIONAL_PARTS, newBlock } from '@/lib/cms/templates';
import { t } from '@/lib/i18n';
import type { BlockType } from '@/lib/cms/blocks';
import { FieldEditor, missingParts, type Json } from './field-editor';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface EditorVersion {
  id: string;
  versionNo: number;
  status: string;
  publishAt: string | null;
  publishedAt: string | null;
  note: string | null;
  createdAt: string;
}

interface Props {
  slug: string;
  kind: 'page' | 'legal' | 'help';
  initial: { title: string; description: string; blocks: Json[] };
  basedOn: 'draft' | 'published' | 'built_in' | 'new';
  open: EditorVersion | null;
  versions: EditorVersion[];
  noindex: boolean;
  canPublishDirect: boolean;
}

type BlockData = { [key: string]: Json };
const utc = (v: string): string => v.replace('T', ' ').slice(0, 16);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

export function PageEditor(props: Props): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(props.initial.title);
  const [description, setDescription] = useState(props.initial.description);
  const [blocks, setBlocks] = useState<BlockData[]>(props.initial.blocks as BlockData[]);
  const [note, setNote] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [adding, setAdding] = useState<BlockType>('richtext');
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = props.open !== null && props.open.status !== 'draft';
  const query = `?kind=${props.kind}`;

  async function call(path: string, body: unknown, ok: string): Promise<boolean> {
    setBusy(true);
    setMessage(t('s06Public.cms.working'));
    try {
      const response = await fetch(`${path}${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage(ok);
        router.refresh();
        return true;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(parsed.success ? parsed.data.error.message : t('s06Public.cms.error'));
    } catch {
      setMessage(t('s06Public.cms.error'));
    } finally {
      setBusy(false);
    }
    return false;
  }

  const save = (): Promise<boolean> =>
    call(
      '/api/cms/save',
      { action: 'save', slug: props.slug, title, description, blocks, note },
      t('s06Public.cms.saved'),
    );

  async function publish(): Promise<void> {
    if (!(await save())) return;
    const at = publishAt ? new Date(publishAt).toISOString() : null;
    await call(
      '/api/cms/publish',
      { action: 'publish', slug: props.slug, publishAt: at },
      t('s06Public.cms.done'),
    );
  }

  const parsedPreview = pageContentSchema.safeParse(blocks);
  const setBlock = (i: number, next: BlockData): void =>
    setBlocks(blocks.map((b, j) => (j === i ? next : b)));

  return (
    <div className="space-y-sp-24">
      <p className="text-sm text-muted-foreground">
        {t('s06Public.cms.basedOn', { source: t(`s06Public.cms.sources.${props.basedOn}`) })}{' '}
        {props.canPublishDirect ? t('s06Public.cms.directNote') : t('s06Public.cms.approvalNote')}
      </p>
      {props.open && props.open.status !== 'draft' ? (
        <Alert>
          <Badge variant="outline">{props.open.status}</Badge>{' '}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void call(
                '/api/cms/publish',
                { action: 'cancel', slug: props.slug },
                t('s06Public.cms.done'),
              )
            }
          >
            {t('s06Public.cms.callBack')}
          </Button>
        </Alert>
      ) : null}
      <fieldset disabled={locked || busy} className="space-y-sp-16">
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.cms.pageTitle')}</span>
          <Input value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.cms.pageDescription')}</span>
          <Textarea
            value={description}
            rows={2}
            maxLength={170}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <h2 className="text-h3 font-semibold">{t('s06Public.cms.blocks')}</h2>
        {blocks.map((block, i) => {
          const type = String(block.type);
          return (
            <section
              key={String(block.id)}
              className="space-y-sp-12 rounded-lg border p-sp-16"
              aria-label={BLOCK_LABELS[type as BlockType] ?? type}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-medium">
                  {i + 1}. {BLOCK_LABELS[type as BlockType] ?? type}
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('s06Public.cms.moveUp')}
                  onClick={() => setBlocks(move(blocks, i, i - 1))}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('s06Public.cms.moveDown')}
                  onClick={() => setBlocks(move(blocks, i, i + 1))}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('s06Public.cms.remove')}
                  onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {Object.entries(block).map(([key, value]) =>
                key === 'id' || key === 'type' ? null : (
                  <FieldEditor
                    key={key}
                    blockType={type}
                    name={key}
                    value={value}
                    onChange={(next) => {
                      const copy: BlockData = { ...block };
                      if (next === null) delete copy[key];
                      else copy[key] = next;
                      setBlock(i, copy);
                    }}
                  />
                ),
              )}
              {missingParts(type, block).map((part) => (
                <Button
                  key={part}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setBlock(i, {
                      ...block,
                      [part]: JSON.parse(JSON.stringify(OPTIONAL_PARTS[type]?.[part])) as Json,
                    })
                  }
                >
                  {t('s06Public.cms.addPart', { part })}
                </Button>
              ))}
            </section>
          );
        })}
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.cms.addBlock')}</span>
            <NativeSelect value={adding} onChange={(e) => setAdding(e.target.value as BlockType)}>
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((k) => (
                <option key={k} value={k}>
                  {BLOCK_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => setBlocks([...blocks, newBlock(adding) as BlockData])}
          >
            {t('s06Public.cms.addBlock')}
          </Button>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.cms.note')}</span>
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" disabled={busy} onClick={() => void save()}>
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
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void publish()}>
            {publishAt ? t('s06Public.cms.schedule') : t('s06Public.cms.publishNow')}
          </Button>
        </div>
      </fieldset>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
      <div className="space-y-sp-12">
        <Button type="button" variant="outline" onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? t('s06Public.cms.hidePreview') : t('s06Public.cms.showPreview')}
        </Button>
        {showPreview ? (
          parsedPreview.success ? (
            <div
              className="overflow-hidden rounded-lg border"
              aria-label={t('s06Public.cms.preview')}
            >
              <BlockList blocks={parsedPreview.data} />
            </div>
          ) : (
            <Alert>
              {t('s06Public.cms.previewInvalid', {
                message: parsedPreview.error.issues[0]?.message ?? '',
              })}
            </Alert>
          )
        ) : null}
      </div>
      <section className="space-y-sp-12" aria-labelledby="versions-title">
        <h2 id="versions-title" className="text-h3 font-semibold">
          {t('s06Public.cms.versions')}
        </h2>
        <ul className="divide-y rounded-lg border">
          {props.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 p-sp-12 text-sm">
              <span className="font-medium">{t('s06Public.cms.version', { no: v.versionNo })}</span>
              <Badge variant="outline">{v.status}</Badge>
              <span className="text-muted-foreground">{utc(v.createdAt)}</span>
              {v.note ? <span className="text-muted-foreground">{v.note}</span> : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy || props.open !== null}
                onClick={() =>
                  void call(
                    '/api/cms/publish',
                    { action: 'revert', slug: props.slug, versionNo: v.versionNo },
                    t('s06Public.cms.done'),
                  )
                }
              >
                {t('s06Public.cms.revert')}
              </Button>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={props.noindex}
            onChange={(e) =>
              void call(
                '/api/cms/publish',
                { action: 'noindex', slug: props.slug, value: e.target.checked },
                t('s06Public.cms.done'),
              )
            }
          />
          <span>{t('s06Public.cms.noindex')}</span>
        </label>
      </section>
    </div>
  );
}
