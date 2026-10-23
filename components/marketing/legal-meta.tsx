// path: components/marketing/legal-meta.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ACCEPTABLE_PAGES } from '@/lib/cms/legal-pages';
import { t } from '@/lib/i18n';

/** Version line of a legal page, with a button to record that the visitor accepts this version. */
export function LegalMeta({
  slug,
  version,
  effective,
}: {
  slug: string;
  version: string;
  effective: string;
}): JSX.Element {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  async function accept(): Promise<void> {
    setState('busy');
    try {
      const response = await fetch('/api/public-site/legal/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      setState(response.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }
  return (
    <div className="mx-auto w-full max-w-7xl px-sp-16">
      <div className="flex flex-wrap items-center gap-sp-12 rounded-lg border bg-muted/40 p-sp-12 text-sm">
        <span>{t('s06Public.legal.effective', { date: effective, version })}</span>
        {ACCEPTABLE_PAGES.includes(slug) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={state === 'busy' || state === 'done'}
            onClick={() => void accept()}
          >
            {t('s06Public.legal.accept')}
          </Button>
        ) : null}
        <span aria-live="polite" className="text-muted-foreground">
          {state === 'done' ? t('s06Public.legal.accepted') : null}
          {state === 'error' ? t('s06Public.legal.error') : null}
        </span>
      </div>
    </div>
  );
}
