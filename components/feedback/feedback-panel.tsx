// path: components/feedback/feedback-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const CATEGORIES = ['idea', 'problem', 'praise', 'other'] as const;

async function post(body: unknown): Promise<string | null> {
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const err = errorBody.safeParse(await response.json().catch(() => null));
    return err.success ? err.data.error.message : t('s07Company.feedback.error');
  } catch {
    return t('s07Company.feedback.error');
  }
}

/** The satisfaction question (when due) and the free feedback form. Can be placed on any company page. */
export function FeedbackPanel({ npsDue }: { npsDue: boolean }): JSX.Element {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(body: unknown, reset: () => void): Promise<void> {
    setBusy(true);
    setNote(null);
    const error = await post(body);
    setBusy(false);
    if (error) setNote({ ok: false, text: error });
    else {
      reset();
      setNote({ ok: true, text: t('s07Company.feedback.thanks') });
      router.refresh();
    }
  }

  return (
    <div className="space-y-sp-24">
      {npsDue ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s07Company.feedback.npsQuestion')}</h2>
          <div
            className="flex flex-wrap gap-sp-4"
            role="radiogroup"
            aria-label={t('s07Company.feedback.npsQuestion')}
          >
            {Array.from({ length: 11 }, (_, n) => (
              <Button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                variant={score === n ? 'default' : 'outline'}
                onClick={() => setScore(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{t('s07Company.feedback.npsLow')}</span>
            <span>{t('s07Company.feedback.npsHigh')}</span>
          </p>
          <label className="block text-sm">
            <span className="block font-medium">{t('s07Company.feedback.npsComment')}</span>
            <Textarea
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-sp-8">
            <Button
              type="button"
              disabled={busy || score === null}
              onClick={() => void run({ action: 'nps', score, comment }, () => setScore(null))}
            >
              {t('s07Company.feedback.npsSend')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run({ action: 'dismiss' }, () => undefined)}
            >
              {t('s07Company.feedback.npsLater')}
            </Button>
          </div>
        </section>
      ) : null}
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <label className="block text-sm">
          <span className="block font-medium">{t('s07Company.feedback.category')}</span>
          <NativeSelect
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`s07Company.feedback.categories.${c}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-sm">
          <span className="block font-medium">{t('s07Company.feedback.message')}</span>
          <Textarea
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <Button
          type="button"
          disabled={busy || message.trim() === ''}
          onClick={() =>
            void run({ action: 'feedback', category, comment: message, page: '' }, () =>
              setMessage(''),
            )
          }
        >
          {t('s07Company.feedback.send')}
        </Button>
      </section>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
