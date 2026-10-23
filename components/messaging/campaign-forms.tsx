// path: components/messaging/campaign-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

async function post(url: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `ui-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (response.ok) return null;
    const json = (await response.json().catch(() => null)) as Failure | null;
    if (json?.error?.code === 'step_up_required') return t('s16Messaging.common.needStepUp');
    return json?.error?.message ?? t('s16Messaging.common.failed');
  } catch {
    return t('s16Messaging.common.failed');
  }
}

const ORDERS: Record<string, string[]> = {
  'email,whatsapp': ['email', 'whatsapp'],
  'whatsapp,email': ['whatsapp', 'email'],
  email: ['email'],
  whatsapp: ['whatsapp'],
};

function pairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

interface VariantState {
  order: string;
  subject: string;
  body: string;
  template: string;
  values: string;
}

const emptyVariant = (order: string): VariantState => ({
  order,
  subject: '',
  body: '',
  template: '',
  values: '',
});

function VariantFields({
  label,
  v,
  onChange,
  templates,
}: {
  label: string;
  v: VariantState;
  onChange: (next: VariantState) => void;
  templates: { id: string; name: string }[];
}): JSX.Element {
  return (
    <fieldset className="space-y-sp-12 rounded-md border p-sp-12">
      <legend className="px-1 text-sm font-medium">
        {t('s16Messaging.campaigns.variant')} {label}
      </legend>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`mv-order-${label}`}>{t('s16Messaging.campaigns.order')}</Label>
          <NativeSelect
            id={`mv-order-${label}`}
            value={v.order}
            onChange={(e) => onChange({ ...v, order: e.target.value })}
          >
            <option value="email,whatsapp">{t('s16Messaging.campaigns.orderEmail')}</option>
            <option value="whatsapp,email">{t('s16Messaging.campaigns.orderWhatsapp')}</option>
            <option value="email">{t('s16Messaging.campaigns.onlyEmail')}</option>
            <option value="whatsapp">{t('s16Messaging.campaigns.onlyWhatsapp')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`mv-template-${label}`}>{t('s16Messaging.campaigns.template')}</Label>
          <NativeSelect
            id={`mv-template-${label}`}
            value={v.template}
            onChange={(e) => onChange({ ...v, template: e.target.value })}
          >
            <option value="">{t('s16Messaging.campaigns.noTemplate')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`mv-subject-${label}`}>{t('s16Messaging.campaigns.subject')}</Label>
          <Input
            id={`mv-subject-${label}`}
            value={v.subject}
            maxLength={200}
            onChange={(e) => onChange({ ...v, subject: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`mv-values-${label}`}>{t('s16Messaging.campaigns.values')}</Label>
          <Input
            id={`mv-values-${label}`}
            value={v.values}
            onChange={(e) => onChange({ ...v, values: e.target.value })}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`mv-body-${label}`}>{t('s16Messaging.campaigns.body')}</Label>
        <Textarea
          id={`mv-body-${label}`}
          rows={4}
          value={v.body}
          maxLength={4000}
          onChange={(e) => onChange({ ...v, body: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

/** Makes a draft campaign; with the A/B box a second variant appears. */
export function CampaignForm({
  templates,
}: {
  templates: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [ab, setAb] = useState(false);
  const [percent, setPercent] = useState('20');
  const [hours, setHours] = useState('24');
  const [a, setA] = useState(emptyVariant('email,whatsapp'));
  const [b, setB] = useState(emptyVariant('whatsapp,email'));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const variant = (v: VariantState): Record<string, unknown> => ({
    channelOrder: ORDERS[v.order] ?? ['email'],
    subject: v.subject,
    body: v.body,
    whatsappTemplateId: v.template === '' ? null : v.template,
    whatsappValues: pairs(v.values),
  });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const problem = await post('/api/integrations/messaging/campaigns', {
      name,
      audience: {
        tags: tags
          .split(';')
          .map((x) => x.trim())
          .filter(Boolean),
      },
      variants: ab ? [variant(a), variant(b)] : [variant(a)],
      abEnabled: ab,
      testPercent: Number.parseInt(percent, 10) || 20,
      decideAfterHours: Number.parseInt(hours, 10) || 24,
    });
    setNotice(
      problem ? { ok: false, text: problem } : { ok: true, text: t('s16Messaging.common.done') },
    );
    if (!problem) {
      setName('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mc-name">{t('s16Messaging.campaigns.name')}</Label>
          <Input
            id="mc-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mc-tags">{t('s16Messaging.campaigns.tags')}</Label>
          <Input
            id="mc-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ab} onChange={(e) => setAb(e.target.checked)} />
        {t('s16Messaging.campaigns.ab')}
      </label>
      {ab ? (
        <div className="grid gap-sp-12 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mc-percent">{t('s16Messaging.campaigns.testPercent')}</Label>
            <Input
              id="mc-percent"
              inputMode="numeric"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mc-hours">{t('s16Messaging.campaigns.decideAfter')}</Label>
            <Input
              id="mc-hours"
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      <VariantFields label="A" v={a} onChange={setA} templates={templates} />
      {ab ? <VariantFields label="B" v={b} onChange={setB} templates={templates} /> : null}
      <Button type="submit" disabled={busy || name.trim() === ''}>
        {t('s16Messaging.campaigns.create')}
      </Button>
    </form>
  );
}

/** Starts a draft campaign for the number of clients the page showed; cancels a running one. */
export function CampaignButton({
  id,
  action,
  expected,
  label,
  variant = 'default',
}: {
  id: string;
  action: 'start' | 'cancel';
  expected?: number;
  label: string;
  variant?: 'default' | 'destructive' | 'outline';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const problem = await post(
      `/api/integrations/messaging/campaigns/${id}/${action}`,
      action === 'start' ? { expectedCount: expected ?? 0 } : {},
    );
    if (problem) setError(problem);
    else router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={busy || (action === 'start' && !expected)}
        onClick={() => void run()}
      >
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}
