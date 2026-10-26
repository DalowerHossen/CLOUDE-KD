// path: app/(admin)/admin/releases/_components/release-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { MAX_TOUR_STEPS, type TourStep } from '@/lib/platform/release-notes';
import type { ReleaseNote } from '@/services/platform/release-notes';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s16Growth.releases.${k}` as never);
type Draft = { title: string; body: string; href: string };

export function ReleaseManager({ notes }: { notes: ReleaseNote[] }): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'feature' | 'improvement' | 'fix'>('feature');
  const [audience, setAudience] = useState<'all' | 'owners'>('all');
  const [steps, setSteps] = useState<Draft[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(payload: Record<string, unknown>, after?: () => void): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/admin/releases', 'POST', payload);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('saved') });
      after?.();
      router.refresh();
    }
  }

  const tour: TourStep[] = steps.map((s) => ({
    title: s.title,
    body: s.body,
    href: s.href.trim() === '' ? null : s.href.trim(),
  }));
  const setStep = (i: number, patch: Partial<Draft>): void =>
    setSteps(steps.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const field = 'block text-sm font-medium';
  const select = 'w-full rounded-md border bg-background px-sp-8 py-sp-4 text-sm';

  return (
    <div className="space-y-sp-16">
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <label className={field} htmlFor="r-title">
          {p('noteTitle')}
        </label>
        <Input
          id="r-title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className={field} htmlFor="r-body">
          {p('body')}
        </label>
        <Textarea
          id="r-body"
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor="r-kind">
              {p('kind')}
            </label>
            <select
              id="r-kind"
              className={select}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="feature">feature</option>
              <option value="improvement">improvement</option>
              <option value="fix">fix</option>
            </select>
          </div>
          <div>
            <label className={field} htmlFor="r-aud">
              {p('audience')}
            </label>
            <select
              id="r-aud"
              className={select}
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
            >
              <option value="all">{p('audienceAll')}</option>
              <option value="owners">{p('audienceOwners')}</option>
            </select>
          </div>
        </div>
        <h2 className="text-h4 font-semibold">{p('tourTitle')}</h2>
        {steps.map((s, i) => (
          <div key={i} className="space-y-sp-4 rounded-lg border p-sp-12">
            <label className={field} htmlFor={`s-title-${i}`}>
              {p('stepTitle')} {i + 1}
            </label>
            <Input
              id={`s-title-${i}`}
              value={s.title}
              maxLength={80}
              onChange={(e) => setStep(i, { title: e.target.value })}
            />
            <label className={field} htmlFor={`s-body-${i}`}>
              {p('stepBody')}
            </label>
            <Input
              id={`s-body-${i}`}
              value={s.body}
              maxLength={400}
              onChange={(e) => setStep(i, { body: e.target.value })}
            />
            <label className={field} htmlFor={`s-href-${i}`}>
              {p('stepHref')}
            </label>
            <Input
              id={`s-href-${i}`}
              value={s.href}
              maxLength={80}
              onChange={(e) => setStep(i, { href: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setSteps(steps.filter((_, n) => n !== i))}
            >
              {p('removeStep')}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-sp-8">
          {steps.length < MAX_TOUR_STEPS ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSteps([...steps, { title: '', body: '', href: '' }])}
            >
              {p('addStep')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={title.trim().length < 3 || body.trim().length < 3}
            onClick={() =>
              void send({ action: 'publish', title, body, kind, audience, tour }, () => {
                setTitle('');
                setBody('');
                setSteps([]);
              })
            }
          >
            {p('publish')}
          </Button>
        </div>
      </section>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p('empty')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {notes.map((n) => (
            <li key={n.id} className="space-y-1 rounded-lg border bg-card p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8">
                <p className="font-medium">{n.title}</p>
                <span className="flex items-center gap-sp-8">
                  <Badge variant="outline">
                    {n.status === 'published' ? p('live') : p('withdrawn')}
                  </Badge>
                  {n.status === 'published' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void send({ action: 'withdraw', id: n.id })}
                    >
                      {p('withdraw')}
                    </Button>
                  ) : null}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              <p className="text-muted-foreground">
                {n.publishedAt.slice(0, 10)} - {n.kind} - {n.tour.length} {p('steps')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
