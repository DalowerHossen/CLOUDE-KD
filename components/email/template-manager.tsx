// path: components/email/template-manager.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const detailBody = z.object({
  data: z.object({
    id: z.string(),
    editable: z.boolean(),
    variables: z.array(z.string()),
    defaultSubject: z.string(),
    subject: z.string(),
    bodyHtml: z.string(),
    edited: z.boolean(),
    inheritedFromPlatform: z.boolean(),
    history: z.array(
      z.object({
        revision: z.number(),
        status: z.string(),
        subject: z.string(),
        note: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
});
const previewBody = z.object({
  data: z.object({ subject: z.string(), html: z.string(), width: z.number() }),
});
type Detail = z.infer<typeof detailBody>['data'];

export interface TemplateItem {
  id: string;
  category: string;
  subject: string;
  variables: readonly string[];
  editable: boolean;
  edited: boolean;
}

interface Props {
  readEndpoint: string;
  actionEndpoint: string;
  templates: TemplateItem[];
}

export function TemplateManager({
  readEndpoint,
  actionEndpoint,
  templates: initial,
}: Props): JSX.Element {
  const [templates, setTemplates] = useState(initial);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; width: number } | null>(
    null,
  );
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, init);
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setMessage(
          parsed.success ? parsed.data.error.message : t('s05Storage.templates.genericError'),
        );
        return null;
      }
      return json;
    } catch {
      setMessage(t('s05Storage.templates.genericError'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const post = (body: unknown): Promise<unknown> =>
    call(actionEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function open(id: string): Promise<void> {
    const json = await call(`${readEndpoint}?id=${encodeURIComponent(id)}`);
    const parsed = detailBody.safeParse(json);
    if (!parsed.success) return;
    setDetail(parsed.data.data);
    setSubject(parsed.data.data.subject);
    setBody(parsed.data.data.bodyHtml);
    setPreview(null);
    const first = await post({
      action: 'preview',
      id,
      ...(parsed.data.data.bodyHtml
        ? { subject: parsed.data.data.subject, bodyHtml: parsed.data.data.bodyHtml }
        : {}),
      mobile,
    });
    const shown = previewBody.safeParse(first);
    if (shown.success) setPreview(shown.data.data);
  }

  async function refreshList(): Promise<void> {
    const json = await call(readEndpoint);
    const parsed = z
      .object({
        data: z.array(
          z.object({
            id: z.string(),
            category: z.string(),
            subject: z.string(),
            variables: z.array(z.string()),
            editable: z.boolean(),
            edited: z.boolean(),
          }),
        ),
      })
      .safeParse(json);
    if (parsed.success) setTemplates(parsed.data.data);
  }

  async function runPreview(wide: boolean): Promise<void> {
    if (!detail) return;
    setMobile(!wide);
    const json = await post({
      action: 'preview',
      id: detail.id,
      ...(body.trim() ? { subject, bodyHtml: body } : {}),
      mobile: !wide,
    });
    const parsed = previewBody.safeParse(json);
    if (parsed.success) setPreview(parsed.data.data);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail) return;
    const note = String(new FormData(event.currentTarget).get('note') ?? '');
    if (await post({ action: 'save', id: detail.id, subject, bodyHtml: body, note })) {
      setMessage(t('s05Storage.templates.saved'));
      await open(detail.id);
      await refreshList();
    }
  }

  async function simple(
    action: 'reset' | 'restore',
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!detail) return;
    if (await post({ action, id: detail.id, ...extra })) {
      await open(detail.id);
      await refreshList();
    }
  }

  return (
    <div className="grid gap-sp-24 lg:grid-cols-[18rem_1fr]">
      <nav aria-label={t('s05Storage.templates.listTitle')}>
        <ul className="space-y-1">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => open(tpl.id)}
                aria-current={detail?.id === tpl.id ? 'true' : undefined}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${detail?.id === tpl.id ? 'bg-muted' : ''}`}
              >
                <span className="block font-mono text-xs">{tpl.id}</span>
                <span className="block truncate text-muted-foreground">{tpl.subject}</span>
                <span className="mt-1 flex gap-1">
                  <Badge variant="outline">{tpl.category}</Badge>
                  {tpl.edited ? (
                    <Badge variant="secondary">{t('s05Storage.templates.edited')}</Badge>
                  ) : null}
                  {!tpl.editable ? (
                    <Badge variant="outline">{t('s05Storage.templates.locked')}</Badge>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-sp-16">
        {!detail ? (
          <p className="text-sm text-muted-foreground">{t('s05Storage.templates.choose')}</p>
        ) : (
          <>
            <h2 className="font-mono text-base">{detail.id}</h2>
            {detail.inheritedFromPlatform ? (
              <p className="text-sm text-muted-foreground">{t('s05Storage.templates.inherited')}</p>
            ) : null}
            <p className="text-sm">
              {t('s05Storage.templates.variables')}{' '}
              {detail.variables.length === 0
                ? t('s05Storage.templates.noVariables')
                : detail.variables.map((v) => (
                    <code key={v} className="mr-1 rounded bg-muted px-1">{`{{${v}}}`}</code>
                  ))}
            </p>
            {detail.editable ? (
              <form
                onSubmit={save}
                className="space-y-sp-12"
                aria-label={t('s05Storage.templates.editor')}
              >
                <label className="block space-y-1 text-sm">
                  <span>{t('s05Storage.templates.subject')}</span>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    maxLength={300}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>{t('s05Storage.templates.body')}</span>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    maxLength={100000}
                    className="font-mono text-xs"
                    placeholder={t('s05Storage.templates.bodyHelp')}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>{t('s05Storage.templates.note')}</span>
                  <Input name="note" maxLength={300} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy || body.trim() === ''}>
                    {t('s05Storage.templates.save')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => runPreview(true)}
                  >
                    {t('s05Storage.templates.previewDesktop')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => runPreview(false)}
                  >
                    {t('s05Storage.templates.previewMobile')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !detail.edited}
                    onClick={() => simple('reset')}
                  >
                    {t('s05Storage.templates.reset')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t('s05Storage.templates.lockedHelp')}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => runPreview(true)}
                  >
                    {t('s05Storage.templates.previewDesktop')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => runPreview(false)}
                  >
                    {t('s05Storage.templates.previewMobile')}
                  </Button>
                </div>
              </div>
            )}
            {preview ? (
              <div className="space-y-1">
                <p className="text-sm">
                  <strong>{t('s05Storage.templates.subject')}:</strong> {preview.subject}
                </p>
                <iframe
                  title={t('s05Storage.templates.previewTitle')}
                  sandbox=""
                  srcDoc={preview.html}
                  style={{
                    width: preview.width,
                    maxWidth: '100%',
                    height: 480,
                    border: '1px solid #d1d5db',
                    background: '#fff',
                  }}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.templates.testTo')}</span>
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  maxLength={254}
                  className="w-64"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy || testTo.length < 5}
                onClick={() =>
                  post({ action: 'test', id: detail.id, to: testTo }).then(
                    (r) => r && setMessage(t('s05Storage.templates.testSent')),
                  )
                }
              >
                {t('s05Storage.templates.test')}
              </Button>
            </div>
            {detail.history.length > 0 ? (
              <section aria-labelledby="history-title" className="space-y-1">
                <h3 id="history-title" className="text-base font-semibold">
                  {t('s05Storage.templates.history')}
                </h3>
                <ul className="space-y-1 text-sm">
                  {detail.history.map((h) => (
                    <li key={h.revision} className="flex flex-wrap items-center gap-2">
                      <Badge variant={h.status === 'active' ? 'outline' : 'secondary'}>
                        #{h.revision}
                      </Badge>
                      <span>{h.createdAt.replace('T', ' ').slice(0, 16)} UTC</span>
                      <span className="text-muted-foreground">{h.note ?? ''}</span>
                      {h.status !== 'active' && detail.editable ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => simple('restore', { revision: h.revision })}
                        >
                          {t('s05Storage.templates.restore')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}
