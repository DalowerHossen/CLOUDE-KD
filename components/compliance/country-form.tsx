// path: components/compliance/country-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

/** Adds a country restriction. The server checks every field again. */
export function CountryForm(): JSX.Element {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('');
  const [mode, setMode] = useState<'block' | 'review'>('block');
  const [source, setSource] = useState<'un_security_council' | 'manual'>('un_security_council');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/compliance/countries', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          countryCode: countryCode.trim().toUpperCase(),
          mode,
          source,
          reference,
          reason,
        }),
        cache: 'no-store',
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as Failure | null;
        setNotice({
          ok: false,
          text:
            json?.error?.code === 'step_up_required'
              ? t('s16Compliance.common.needStepUp')
              : (json?.error?.message ?? t('s16Compliance.common.failed')),
        });
      } else {
        setNotice({ ok: true, text: t('s16Compliance.common.done') });
        setCountryCode('');
        setReference('');
        setReason('');
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Compliance.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-sp-12" aria-label={t('s16Compliance.page.addTitle')}>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-sp-4">
          <Label htmlFor="cc-code">{t('s16Compliance.page.countryCode')}</Label>
          <Input
            id="cc-code"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            maxLength={2}
            required
          />
        </div>
        <div className="space-y-sp-4">
          <Label htmlFor="cc-mode">{t('s16Compliance.page.mode')}</Label>
          <NativeSelect
            id="cc-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value === 'review' ? 'review' : 'block')}
          >
            <option value="block">{t('s16Compliance.page.modes.block')}</option>
            <option value="review">{t('s16Compliance.page.modes.review')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-sp-4">
          <Label htmlFor="cc-source">{t('s16Compliance.page.source')}</Label>
          <NativeSelect
            id="cc-source"
            value={source}
            onChange={(e) =>
              setSource(e.target.value === 'manual' ? 'manual' : 'un_security_council')
            }
          >
            <option value="un_security_council">
              {t('s16Compliance.page.sources.un_security_council')}
            </option>
            <option value="manual">{t('s16Compliance.page.sources.manual')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-sp-4">
          <Label htmlFor="cc-ref">{t('s16Compliance.page.referenceHelp')}</Label>
          <Input
            id="cc-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={300}
          />
        </div>
      </div>
      <div className="space-y-sp-4">
        <Label htmlFor="cc-reason">{t('s16Compliance.page.reasonHelp')}</Label>
        <Input
          id="cc-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={500}
          required
        />
      </div>
      {notice ? (
        <Alert variant={notice.ok ? 'default' : 'destructive'} role="status">
          {notice.text}
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy}>
        {t('s16Compliance.page.add')}
      </Button>
    </form>
  );
}
