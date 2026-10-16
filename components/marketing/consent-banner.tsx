// path: components/marketing/consent-banner.tsx
'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  OPEN_CONSENT_EVENT,
  consentFromCookieString,
  serializeConsent,
  type ConsentChoice,
} from '@/lib/analytics/consent';
import { t } from '@/lib/i18n';

/** Button for the footer: opens the banner again so the choice can be changed. */
export function CookieSettingsButton({ className }: { className?: string }): JSX.Element {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      {t('s06Public.footer.cookieSettings')}
    </button>
  );
}

const CHANGED = 'kd:consent-changed';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
/** The raw cookie text, or "" when there is no choice yet. */
function readRaw(): string {
  const saved = consentFromCookieString(document.cookie);
  return saved ? serializeConsent(saved) : '';
}

export function ConsentBanner(): JSX.Element | null {
  // "ssr" while rendering on the server: the banner appears only after the browser has read the cookie.
  const raw = useSyncExternalStore(subscribe, readRaw, () => 'ssr');
  const [reopened, setReopened] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>({ analytics: false, marketing: false });
  const [note, setNote] = useState<string | null>(null);
  const open = reopened || raw === '';

  useEffect(() => {
    const reopen = (): void => {
      setDraft(consentFromCookieString(document.cookie) ?? { analytics: false, marketing: false });
      setCustom(true);
      setReopened(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const save = useCallback(async (next: ConsentChoice): Promise<void> => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(next)}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    setReopened(false);
    setCustom(false);
    // Scripts that wait for consent start (or stop) when they hear this event.
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: next }));
    try {
      const response = await fetch('/api/public-site/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      setNote(response.ok ? t('s06Public.consent.saved') : t('s06Public.consent.error'));
    } catch {
      setNote(t('s06Public.consent.error'));
    }
  }, []);

  const choice = draft;
  const setChoice = setDraft;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          className="no-print fixed inset-x-0 bottom-0 z-toast border-t bg-background p-sp-16 shadow-lg safe-bottom safe-x"
        >
          <div className="mx-auto max-w-4xl space-y-sp-12">
            <h2 id="consent-title" className="text-base font-semibold">
              {t('s06Public.consent.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('s06Public.consent.text')}</p>
            {custom ? (
              <fieldset className="space-y-2 text-sm">
                <legend className="sr-only">{t('s06Public.consent.region')}</legend>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked disabled className="mt-1" />
                  <span>
                    <strong>{t('s06Public.consent.necessary')}</strong> -{' '}
                    {t('s06Public.consent.necessaryText')}
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={choice.analytics}
                    onChange={(e) => setChoice({ ...choice, analytics: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <strong>{t('s06Public.consent.analytics')}</strong> -{' '}
                    {t('s06Public.consent.analyticsText')}
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={choice.marketing}
                    onChange={(e) => setChoice({ ...choice, marketing: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <strong>{t('s06Public.consent.marketing')}</strong> -{' '}
                    {t('s06Public.consent.marketingText')}
                  </span>
                </label>
              </fieldset>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => save({ analytics: true, marketing: true })}>
                {t('s06Public.consent.acceptAll')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => save({ analytics: false, marketing: false })}
              >
                {t('s06Public.consent.rejectAll')}
              </Button>
              {custom ? (
                <Button type="button" variant="secondary" onClick={() => save(choice)}>
                  {t('s06Public.consent.save')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setCustom(true)}>
                  {t('s06Public.consent.customize')}
                </Button>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
