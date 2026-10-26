// path: app/(dashboard)/whats-new/_components/release-list.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { ReaderNote } from '@/services/platform/release-notes';

const p = (k: string, v?: Record<string, string | number>): string =>
  t(`s16Growth.whatsNew.${k}` as never, v);
const errorBody = z.object({ error: z.object({ message: z.string() }) });

async function record(action: 'seen' | 'tour_done', ids: string[]): Promise<string | null> {
  try {
    const response = await fetch('/api/whats-new', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    if (response.ok) return null;
    const parsed = errorBody.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.error.message : p('error');
  } catch {
    return p('error');
  }
}

export function ReleaseList({ notes }: { notes: ReaderNote[] }): JSX.Element {
  const router = useRouter();
  const [touring, setTouring] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const unseenIds = notes.filter((n) => !n.seen).map((n) => n.id);

  async function send(action: 'seen' | 'tour_done', ids: string[]): Promise<boolean> {
    const failed = await record(action, ids);
    setError(failed);
    if (!failed) router.refresh();
    return failed === null;
  }

  return (
    <div className="space-y-sp-12">
      {unseenIds.length > 0 ? (
        <Button type="button" variant="outline" onClick={() => void send('seen', unseenIds)}>
          {p('markSeen')}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="space-y-sp-8">
        {notes.map((n) => {
          const step = touring === n.id ? n.tour[index] : undefined;
          return (
            <li key={n.id} className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8">
                <p className="font-medium">{n.title}</p>
                <span className="flex gap-sp-8">
                  {!n.seen ? <Badge>{p('newBadge')}</Badge> : null}
                  <Badge variant="outline">{p(`kind_${n.kind}`)}</Badge>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              <p className="text-muted-foreground">{n.publishedAt.slice(0, 10)}</p>
              {n.tour.length > 0 && touring !== n.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTouring(n.id);
                    setIndex(0);
                    if (!n.seen) void send('seen', [n.id]);
                  }}
                >
                  {n.tourDone ? p('tourDone') : p('startTour')}
                </Button>
              ) : null}
              {step ? (
                <div className="space-y-sp-8 rounded-lg border bg-background p-sp-12" role="group">
                  <p className="text-muted-foreground">
                    {p('step')} {index + 1} / {n.tour.length}
                  </p>
                  <p className="font-medium">{step.title}</p>
                  <p className="break-words">{step.body}</p>
                  {step.href ? (
                    <Link className="underline" href={step.href}>
                      {p('open')}
                    </Link>
                  ) : null}
                  <div className="flex gap-sp-8">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => setIndex(index - 1)}
                    >
                      {p('back')}
                    </Button>
                    {index < n.tour.length - 1 ? (
                      <Button type="button" onClick={() => setIndex(index + 1)}>
                        {p('next')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={async () => {
                          if (await send('tour_done', [n.id])) setTouring(null);
                        }}
                      >
                        {p('finish')}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
