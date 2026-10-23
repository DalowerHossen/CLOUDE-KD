// path: components/client/estimate-decision.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

type Outcome = 'accepted' | 'declined';

/** Accept or decline with a typed name, an agreement box and an optional note. The answer is final. */
export function EstimateDecision({ token }: { token: string }): JSX.Element {
  const [signerName, setSignerName] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Outcome | null>(null);

  async function send(decision: Outcome): Promise<void> {
    setError(null);
    if (signerName.trim().length < 2) {
      setError(t('s13Portal.estimate.nameRequired'));
      return;
    }
    if (decision === 'accepted' && !agree) {
      setError(t('s13Portal.estimate.agreeRequired'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/portal/estimate/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, decision, signerName: signerName.trim(), note, agree }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('decide');
      setDone(decision);
    } catch {
      setError(t('s13Portal.estimate.failed'));
    }
    setBusy(false);
  }

  if (done)
    return (
      <Alert variant={done === 'accepted' ? 'success' : 'default'}>
        {done === 'accepted'
          ? t('s13Portal.estimate.thanksAccepted')
          : t('s13Portal.estimate.thanksDeclined')}
      </Alert>
    );

  return (
    <form
      className="space-y-sp-12 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void send('accepted');
      }}
      aria-label={t('s13Portal.estimate.decisionTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s13Portal.estimate.decisionTitle')}</h2>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="estimate-name">{t('s13Portal.estimate.nameLabel')}</Label>
        <Input
          id="estimate-name"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          maxLength={200}
          autoComplete="name"
          disabled={busy}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="estimate-note">{t('s13Portal.estimate.noteLabel')}</Label>
        <Textarea
          id="estimate-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          disabled={busy}
        />
      </div>
      <div className="flex items-start gap-sp-8">
        <Checkbox
          id="estimate-agree"
          checked={agree}
          onCheckedChange={(value) => setAgree(value === true)}
          disabled={busy}
        />
        <Label htmlFor="estimate-agree" className="text-sm font-normal">
          {t('s13Portal.estimate.agreeLabel')}
        </Label>
      </div>
      <div className="flex flex-col gap-sp-8 sm:flex-row">
        <Button type="submit" size="lg" className="sm:flex-1" disabled={busy}>
          {t('s13Portal.estimate.accept')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void send('declined')}
        >
          {t('s13Portal.estimate.decline')}
        </Button>
      </div>
    </form>
  );
}
