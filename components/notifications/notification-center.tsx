// path: components/notifications/notification-center.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/config/notifications';
import { t, type StringKey } from '@/lib/i18n';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface Item {
  id: string;
  category: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}
export interface PrefRow {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  alwaysOn: boolean;
  mutedUntil: string | null;
}

interface Props {
  userId: string;
  items: Item[];
  unread: number;
  filter: { unread: boolean; category: NotificationCategory | null };
  prefs: PrefRow[];
  dailyDigest: boolean;
}

const label = (c: string): string => t(`s05Storage.notifications.category_${c}` as StringKey);

export function NotificationCenter({
  userId,
  items,
  unread,
  filter,
  prefs,
  dailyDigest,
}: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // New rows for this person arrive through Realtime (the table allows a person to read only their own rows).
  useEffect(() => {
    const client = getBrowserSupabase();
    const channel = client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [userId, router]);

  async function send(method: 'PATCH' | 'POST', body: unknown): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/notifications', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        if (method === 'POST') setMessage(t('s05Storage.notifications.done'));
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(
          parsed.success ? parsed.data.error.message : t('s05Storage.notifications.genericError'),
        );
      }
    } catch {
      setMessage(t('s05Storage.notifications.genericError'));
    } finally {
      setBusy(false);
    }
  }

  const href = (next: { unread?: boolean; category?: string | null }): string => {
    const q = new URLSearchParams();
    if (next.unread ?? filter.unread) q.set('unread', '1');
    const c = next.category === undefined ? filter.category : next.category;
    if (c) q.set('category', c);
    const s = q.toString();
    return s ? `/notifications?${s}` : '/notifications';
  };

  return (
    <div className="space-y-sp-24">
      <section className="space-y-sp-12" aria-labelledby="list-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="list-title" className="sr-only">
            {t('s05Storage.notifications.listLabel')}
          </h2>
          <Button asChild size="sm" variant={filter.unread ? 'outline' : 'default'}>
            <Link href={href({ unread: false })}>{t('s05Storage.notifications.all')}</Link>
          </Button>
          <Button asChild size="sm" variant={filter.unread ? 'default' : 'outline'}>
            <Link href={href({ unread: true })}>{t('s05Storage.notifications.unread')}</Link>
          </Button>
          <nav
            aria-label={t('s05Storage.notifications.allCategories')}
            className="flex flex-wrap gap-1"
          >
            <Button asChild size="sm" variant={filter.category ? 'outline' : 'secondary'}>
              <Link href={href({ category: null })}>
                {t('s05Storage.notifications.allCategories')}
              </Link>
            </Button>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <Button
                key={c}
                asChild
                size="sm"
                variant={filter.category === c ? 'secondary' : 'outline'}
              >
                <Link href={href({ category: c })}>{label(c)}</Link>
              </Button>
            ))}
          </nav>
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {t('s05Storage.notifications.unreadCount', { count: unread })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || unread === 0}
            onClick={() => send('PATCH', { all: true })}
          >
            {t('s05Storage.notifications.markAll')}
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter.unread
              ? t('s05Storage.notifications.emptyUnread')
              : t('s05Storage.notifications.empty')}
          </p>
        ) : (
          <ul
            className="divide-y rounded-md border"
            aria-label={t('s05Storage.notifications.listLabel')}
          >
            {items.map((n) => (
              <li
                key={n.id}
                className={`flex flex-wrap items-start gap-3 p-sp-12 ${n.read ? '' : 'bg-muted/50'}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {!n.read ? (
                      <span
                        className="h-2 w-2 rounded-full bg-primary"
                        aria-label={t('s05Storage.notifications.unread')}
                      />
                    ) : null}
                    <strong>{n.title}</strong>
                    <Badge variant="outline">{label(n.category)}</Badge>
                  </p>
                  {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {n.createdAt.replace('T', ' ').slice(0, 16)} UTC
                  </p>
                </div>
                <div className="flex gap-2">
                  {n.href ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (!n.read) void send('PATCH', { ids: [n.id] });
                        }}
                      >
                        {t('s05Storage.notifications.open')}
                      </Link>
                    </Button>
                  ) : null}
                  {!n.read ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => send('PATCH', { ids: [n.id] })}
                    >
                      {t('s05Storage.notifications.markOne')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-sp-12" aria-labelledby="settings-title">
        <h2 id="settings-title" className="text-h3 font-semibold">
          {t('s05Storage.notifications.settingsTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('s05Storage.notifications.settingsHelp')}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th scope="col" className="py-1 pr-3">
                  {t('s05Storage.notifications.colTopic')}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t('s05Storage.notifications.colInApp')}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t('s05Storage.notifications.colEmail')}
                </th>
                <th scope="col" className="py-1">
                  {t('s05Storage.notifications.colMute')}
                </th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.category} className="border-t">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {label(p.category)}
                  </th>
                  <td className="py-2 pr-3">
                    {p.alwaysOn ? (
                      <span>{t('s05Storage.notifications.alwaysOn')}</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={p.inApp}
                        disabled={busy}
                        aria-label={`${label(p.category)}: ${t('s05Storage.notifications.colInApp')}`}
                        onChange={(e) =>
                          send('POST', {
                            action: 'set_channel',
                            category: p.category,
                            channel: 'in_app',
                            enabled: e.target.checked,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={p.email}
                      disabled={busy}
                      aria-label={`${label(p.category)}: ${t('s05Storage.notifications.colEmail')}`}
                      onChange={(e) =>
                        send('POST', {
                          action: 'set_channel',
                          category: p.category,
                          channel: 'email',
                          enabled: e.target.checked,
                        })
                      }
                    />
                  </td>
                  <td className="py-2">
                    {p.alwaysOn ? null : p.mutedUntil ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {t('s05Storage.notifications.pausedUntil', {
                          time: p.mutedUntil.replace('T', ' ').slice(0, 16),
                        })}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => send('POST', { action: 'unmute', category: p.category })}
                        >
                          {t('s05Storage.notifications.unmute')}
                        </Button>
                      </span>
                    ) : (
                      <select
                        aria-label={`${label(p.category)}: ${t('s05Storage.notifications.colMute')}`}
                        defaultValue=""
                        disabled={busy}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        onChange={(e) => {
                          if (e.target.value)
                            void send('POST', {
                              action: 'mute',
                              category: p.category,
                              hours: Number(e.target.value),
                            });
                        }}
                      >
                        <option value="">{t('s05Storage.notifications.colMute')}</option>
                        <option value="1">{t('s05Storage.notifications.mute1')}</option>
                        <option value="8">{t('s05Storage.notifications.mute8')}</option>
                        <option value="24">{t('s05Storage.notifications.mute24')}</option>
                        <option value="168">{t('s05Storage.notifications.mute168')}</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={dailyDigest}
            disabled={busy}
            onChange={(e) => send('POST', { action: 'digest', enabled: e.target.checked })}
          />
          {t('s05Storage.notifications.digest')}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send('POST', { action: 'bulk', channel: 'email', enabled: true })}
          >
            {t('s05Storage.notifications.allOn')} ({t('s05Storage.notifications.colEmail')})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send('POST', { action: 'bulk', channel: 'email', enabled: false })}
          >
            {t('s05Storage.notifications.allOff')} ({t('s05Storage.notifications.colEmail')})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send('POST', { action: 'test' })}
          >
            {t('s05Storage.notifications.test')}
          </Button>
        </div>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      </section>
    </div>
  );
}
