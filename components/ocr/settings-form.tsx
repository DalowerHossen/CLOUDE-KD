// path: components/ocr/settings-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

interface Props {
  enabled: boolean;
  hasConsent: boolean;
  dateOrder: 'dmy' | 'mdy';
  languageHints: string[];
  dailyLimit: number;
}

/** The OCR settings. The key is typed into a password field, sent once and never shown again. */
export function OcrSettingsForm(props: Props): JSX.Element {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.enabled);
  const [apiKey, setApiKey] = useState('');
  const [order, setOrder] = useState(props.dateOrder);
  const [langs, setLangs] = useState(props.languageHints.join(';'));
  const [limit, setLimit] = useState(String(props.dailyLimit));
  const [consent, setConsent] = useState(props.hasConsent);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/ocr/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          ...(apiKey.trim() === '' ? {} : { apiKey: apiKey.trim() }),
          dateOrder: order,
          languageHints: langs
            .split(';')
            .map((x) => x.trim())
            .filter(Boolean),
          dailyLimit: Number.parseInt(limit, 10) || 200,
          consent,
        }),
        cache: 'no-store',
      });
      if (response.ok) {
        setApiKey('');
        setNotice({ ok: true, text: t('s16Ocr.settings.saved') });
        router.refresh();
      } else {
        const json = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        setNotice({
          ok: false,
          text:
            json?.error?.code === 'step_up_required'
              ? t('s16Ocr.common.needStepUp')
              : (json?.error?.message ?? t('s16Ocr.common.failed')),
        });
      }
    } catch {
      setNotice({ ok: false, text: t('s16Ocr.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('s16Ocr.settings.enabled')}
      </label>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ocr-key">{t('s16Ocr.settings.apiKey')}</Label>
          <Input
            id="ocr-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ocr-order">{t('s16Ocr.settings.dateOrder')}</Label>
          <NativeSelect
            id="ocr-order"
            value={order}
            onChange={(e) => setOrder(e.target.value === 'mdy' ? 'mdy' : 'dmy')}
          >
            <option value="dmy">{t('s16Ocr.settings.dmy')}</option>
            <option value="mdy">{t('s16Ocr.settings.mdy')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ocr-langs">{t('s16Ocr.settings.languages')}</Label>
          <Input
            id="ocr-langs"
            value={langs}
            onChange={(e) => setLangs(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ocr-limit">{t('s16Ocr.settings.dailyLimit')}</Label>
          <Input
            id="ocr-limit"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {t('s16Ocr.settings.consent')}
      </label>
      <Button type="submit" disabled={busy}>
        {t('s16Ocr.settings.save')}
      </Button>
    </form>
  );
}
