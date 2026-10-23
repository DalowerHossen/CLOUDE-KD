// path: components/whatsapp/send-forms.tsx
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
  error?: { message?: string };
}
interface Sent {
  data?: { status?: string; errorText?: string | null };
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; text: string }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `ui-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await response.json().catch(() => null)) as (Failure & Sent) | null;
    if (!response.ok)
      return { ok: false, text: json?.error?.message ?? t('s16Whatsapp.common.failed') };
    if (json?.data?.status === 'failed')
      return {
        ok: false,
        text: `${t('s16Whatsapp.messages.failedSend')}: ${json.data.errorText ?? ''}`,
      };
    return { ok: true, text: t('s16Whatsapp.messages.sent') };
  } catch {
    return { ok: false, text: t('s16Whatsapp.common.failed') };
  }
}

export function SendTextForm(): JSX.Element {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const result = await post('/api/whatsapp/messages/text', { to, body });
    setNotice(result);
    if (result.ok) {
      setBody('');
      router.refresh();
    }
    setBusy(false);
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="wt-to">{t('s16Whatsapp.messages.to')}</Label>
        <Input id="wt-to" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wt-body">{t('s16Whatsapp.messages.body')}</Label>
        <Input
          id="wt-body"
          value={body}
          maxLength={4096}
          onChange={(e) => setBody(e.target.value)}
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={busy || to.trim() === '' || body.trim() === ''}>
        {t('s16Whatsapp.messages.send')}
      </Button>
    </form>
  );
}

export interface TemplateOption {
  id: string;
  label: string;
  variables: string[];
}

export function SendTemplateForm({ templates }: { templates: TemplateOption[] }): JSX.Element {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const chosen = templates.find((x) => x.id === templateId);
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const wanted = Object.fromEntries((chosen?.variables ?? []).map((v) => [v, values[v] ?? '']));
    const result = await post('/api/whatsapp/messages/template', {
      to,
      templateId,
      values: wanted,
    });
    setNotice(result);
    if (result.ok) router.refresh();
    setBusy(false);
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="wm-to">{t('s16Whatsapp.messages.to')}</Label>
        <Input id="wm-to" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wm-template">{t('s16Whatsapp.messages.template')}</Label>
        <NativeSelect
          id="wm-template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">{t('s16Whatsapp.messages.choose')}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {(chosen?.variables ?? []).map((v) => (
        <div key={v} className="space-y-1">
          <Label htmlFor={`wm-v-${v}`}>
            {t('s16Whatsapp.messages.value')} {`{{${v}}}`}
          </Label>
          <Input
            id={`wm-v-${v}`}
            value={values[v] ?? ''}
            maxLength={1024}
            onChange={(e) => setValues({ ...values, [v]: e.target.value })}
            autoComplete="off"
          />
        </div>
      ))}
      <Button type="submit" disabled={busy || to.trim() === '' || templateId === ''}>
        {t('s16Whatsapp.messages.send')}
      </Button>
    </form>
  );
}
