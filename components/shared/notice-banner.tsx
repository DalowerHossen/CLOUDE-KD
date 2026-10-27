// path: components/shared/notice-banner.tsx
'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';

const noticeList = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      kind: z.enum(['info', 'maintenance', 'warning']),
    }),
  ),
});
type Notice = z.infer<typeof noticeList>['data'][number];

const KEY = 'kd-dismissed-notices';

function dismissedIds(): string[] {
  try {
    const parsed = z
      .array(z.string())
      .safeParse(JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Live notices from the platform team at the top of a page. A person can close one for the rest of the visit. */
export function NoticeBanner({ endpoint }: { endpoint: string }): JSX.Element | null {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const parsed = noticeList.safeParse(body);
        if (!active || !parsed.success) return;
        const hidden = dismissedIds();
        setNotices(parsed.data.data.filter((n) => !hidden.includes(n.id)));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [endpoint]);

  if (notices.length === 0) return null;

  function close(id: string): void {
    setNotices((list) => list.filter((n) => n.id !== id));
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify([...dismissedIds(), id]));
    } catch {
      // The notice just comes back on the next page.
    }
  }

  return (
    <div className="space-y-sp-8 px-sp-16 py-sp-8" aria-label={t('s07Company.adminOps.liveTitle')}>
      {notices.map((n) => (
        <Alert key={n.id} variant={n.kind === 'info' ? 'info' : 'warning'}>
          <div className="flex items-start justify-between gap-sp-8">
            <div className="space-y-1">
              <p className="font-medium">{n.title}</p>
              <p className="whitespace-pre-line text-sm">{n.body}</p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md"
              onClick={() => close(n.id)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('s01Core.common.close')}</span>
            </button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
