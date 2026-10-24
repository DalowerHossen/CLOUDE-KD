// path: components/social/share-bar.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * Share buttons for a link that works without any network widget: copy the link, the share sheet of the device (where the browser has
 * one) and an e-mail. No script of a social network is loaded, so visitors are not tracked by it.
 */
export function ShareBar({ url, title }: { url: string; title: string }): JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const mail = `mailto:?subject=${encodeURIComponent(t('s16Social.share.emailSubject'))}&body=${encodeURIComponent(`${title}\n${url}`)}`;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t('s16Social.share.copied'));
    } catch {
      setNotice(t('s16Social.share.failed'));
    }
  }

  async function share(): Promise<void> {
    try {
      await navigator.share({ title, url });
    } catch {
      // The person closed the share sheet; nothing to report.
    }
  }

  return (
    <span
      className="inline-flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t('s16Social.share.title')}
    >
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {t('s16Social.share.copy')}
      </Button>
      {canShare ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void share()}>
          {t('s16Social.share.device')}
        </Button>
      ) : null}
      <Button asChild size="sm" variant="outline">
        <a href={mail}>{t('s16Social.share.email')}</a>
      </Button>
      {notice ? (
        <span className="text-xs text-muted-foreground" role="status">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
