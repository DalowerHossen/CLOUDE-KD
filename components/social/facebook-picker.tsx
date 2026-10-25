// path: components/social/facebook-picker.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export interface PickRow {
  pageId: string;
  name: string;
  canPost: boolean;
  instagram: { id: string; username: string } | null;
}

const answer = z.object({
  data: z.object({
    connected: z.array(z.string()),
    skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
  }),
});
const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** Choose which Pages and Instagram accounts to connect after the Facebook login. */
export function FacebookPicker({
  sessionId,
  rows,
}: {
  sessionId: string;
  rows: readonly PickRow[];
}): JSX.Element {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);

  const toggle = (key: string): void => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChosen(next);
  };

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const picks = [...chosen].map((k) => {
      const [kind, pageId] = k.split(':');
      return { kind, pageId };
    });
    try {
      const response = await fetch('/api/social/connect/facebook/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, picks }),
        cache: 'no-store',
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const e = errorBody.safeParse(json);
        throw new Error(e.success ? e.data.error.message : t('s16Social.connect.failed'));
      }
      const parsed = answer.safeParse(json);
      if (parsed.success && parsed.data.data.skipped.length > 0) {
        setSkipped(parsed.data.data.skipped);
        setBusy(false);
        return;
      }
      router.push('/social?connect=done');
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('s16Social.connect.failed'));
    }
    setBusy(false);
  }

  if (rows.length === 0) return <Alert>{t('s16Social.connect.noPages')}</Alert>;
  return (
    <div className="space-y-sp-12">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {skipped.length > 0 ? (
        <Alert>
          {skipped.map((s) => `${s.name}: ${s.reason}`).join(' ')}{' '}
          <a className="underline" href="/social">
            {t('s16Social.connect.continue')}
          </a>
        </Alert>
      ) : null}
      <fieldset className="space-y-sp-8">
        <legend className="text-sm font-medium">{t('s16Social.connect.choose')}</legend>
        {rows.map((r) => (
          <div key={r.pageId} className="space-y-1 rounded-md border p-sp-12">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.has(`facebook:${r.pageId}`)}
                disabled={!r.canPost}
                onChange={() => toggle(`facebook:${r.pageId}`)}
              />
              {t('s16Social.connect.page', { name: r.name })}
              {r.canPost ? '' : ` (${t('s16Social.connect.noRole')})`}
            </label>
            {r.instagram ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(`instagram:${r.pageId}`)}
                  onChange={() => toggle(`instagram:${r.pageId}`)}
                />
                {t('s16Social.connect.instagram', {
                  name: r.instagram.username || r.instagram.id,
                })}
              </label>
            ) : null}
          </div>
        ))}
      </fieldset>
      <Button type="button" disabled={busy || chosen.size === 0} onClick={() => void submit()}>
        {busy ? t('s16Social.connect.connecting') : t('s16Social.connect.submit')}
      </Button>
    </div>
  );
}
