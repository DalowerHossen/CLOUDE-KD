// path: components/admin/approvals/solo-mode-toggle.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { t } from '@/lib/i18n';

export function SoloModeToggle({ initial }: { initial: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(next: boolean): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/approvals/platform/solo-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (response.ok) {
        setEnabled(next);
        setMessage(t('s02Governance.approvals.soloSaved'));
      } else {
        setMessage(t('s01Core.states.errorBody'));
      }
    } catch {
      setMessage(t('s01Core.states.errorBody'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-sp-16" aria-labelledby="solo-title">
      <h2 id="solo-title" className="text-h4 font-semibold">
        {t('s02Governance.approvals.soloTitle')}
      </h2>
      <p className="mb-sp-12 text-sm text-muted-foreground">
        {t('s02Governance.approvals.soloBody')}
      </p>
      <div className="flex items-center gap-sp-12">
        <Switch id="solo-mode" checked={enabled} disabled={busy} onCheckedChange={change} />
        <Label htmlFor="solo-mode">{t('s02Governance.approvals.soloToggle')}</Label>
      </div>
      <div aria-live="polite">{message ? <Alert className="mt-sp-12">{message}</Alert> : null}</div>
    </section>
  );
}
