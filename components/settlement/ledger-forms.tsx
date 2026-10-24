// path: components/settlement/ledger-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SETTLEMENT_ENTRY_KINDS } from '@/config/s16-settlement';
import { t } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

type Reply = { ok: true; data: unknown } | { ok: false; text: string };

async function send(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<Reply> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as Failure | null;
      return {
        ok: false,
        text:
          json?.error?.code === 'step_up_required'
            ? t('s16Settlement.common.needStepUp')
            : (json?.error?.message ?? t('s16Settlement.common.failed')),
      };
    }
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return { ok: true, data: json?.data ?? null };
  } catch {
    return { ok: false, text: t('s16Settlement.common.failed') };
  }
}

/** Sets new terms for one sub-merchant or for all. */
export function TermsForm({
  subOptions,
}: {
  subOptions: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [scope, setScope] = useState('');
  const [commission, setCommission] = useState('0');
  const [fee, setFee] = useState('0');
  const [hold, setHold] = useState(0);
  const [min, setMin] = useState('0');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const reply = await send('/api/integrations/settlement/terms', 'POST', {
      subMerchantId: scope === '' ? null : scope,
      commissionPercent: commission.trim(),
      fixedFee: fee.trim(),
      holdDays: hold,
      minPayout: min.trim(),
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Settlement.terms.saved') });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="st-scope">{t('s16Settlement.terms.scope')}</Label>
          <NativeSelect id="st-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('s16Settlement.terms.all')}</option>
            {subOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-commission">{t('s16Settlement.terms.commission')}</Label>
          <Input
            id="st-commission"
            inputMode="decimal"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-fee">{t('s16Settlement.terms.fee')}</Label>
          <Input
            id="st-fee"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-hold">{t('s16Settlement.terms.hold')}</Label>
          <Input
            id="st-hold"
            type="number"
            min={0}
            max={180}
            step={1}
            value={hold}
            onChange={(e) => setHold(e.target.valueAsNumber || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-min">{t('s16Settlement.terms.min')}</Label>
          <Input
            id="st-min"
            inputMode="decimal"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {t('s16Settlement.terms.save')}
      </Button>
    </form>
  );
}

/** Posts a batch of entries typed or pasted as lines: kind,amount,reference,date[,note]. */
export function EntriesForm({ subMerchantId }: { subMerchantId: string }): JSX.Element {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setNotice(null);
    const entries: Record<string, string>[] = [];
    const lines = text.split('\n').filter((l) => l.trim() !== '');
    for (let i = 0; i < lines.length; i += 1) {
      const parts = (lines[i] ?? '').split(',').map((p) => p.trim());
      const [kind, amount, externalRef, occurredAt, ...note] = parts;
      if (
        !kind ||
        !amount ||
        !externalRef ||
        !occurredAt ||
        !(SETTLEMENT_ENTRY_KINDS as readonly string[]).includes(kind)
      ) {
        setNotice({ ok: false, text: t('s16Settlement.entries.badLine', { line: String(i + 1) }) });
        return;
      }
      entries.push({ kind, amount, externalRef, occurredAt, note: note.join(', ') });
    }
    setBusy(true);
    const reply = await send('/api/integrations/settlement/entries', 'POST', {
      subMerchantId,
      entries,
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      const r = reply.data as {
        posted?: number;
        duplicates?: unknown[];
        failed?: unknown[];
      } | null;
      setNotice({
        ok: true,
        text: t('s16Settlement.entries.posted', {
          posted: String(r?.posted ?? 0),
          duplicates: String(r?.duplicates?.length ?? 0),
          failed: String(r?.failed?.length ?? 0),
        }),
      });
      setText('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-8" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <p className="text-sm text-muted-foreground">{t('s16Settlement.entries.addHelp')}</p>
      <div className="space-y-1">
        <Label htmlFor="se-lines">{t('s16Settlement.entries.lines')}</Label>
        <Textarea
          id="se-lines"
          rows={5}
          value={text}
          spellCheck={false}
          placeholder="sale,100.00,order-1,2026-10-24T10:00:00Z"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || text.trim() === ''}>
        {t('s16Settlement.entries.post')}
      </Button>
    </form>
  );
}

/** Records a payout that the main merchant made. */
export function PayoutForm({ subMerchantId }: { subMerchantId: string }): JSX.Element {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const key = `${crypto.randomUUID().replace(/-/g, '')}`;
    const reply = await send('/api/integrations/settlement/payouts', 'POST', {
      subMerchantId,
      amount: amount.trim(),
      reference,
      paidAt: paidAt === '' ? new Date().toISOString() : new Date(paidAt).toISOString(),
      idempotencyKey: key,
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Settlement.payouts.recorded') });
      setAmount('');
      setReference('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-8" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <p className="text-sm text-muted-foreground">{t('s16Settlement.payouts.help')}</p>
      <div className="grid gap-sp-8 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="sp-amount">{t('s16Settlement.payouts.amount')}</Label>
          <Input
            id="sp-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-ref">{t('s16Settlement.payouts.reference')}</Label>
          <Input
            id="sp-ref"
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-date">{t('s16Settlement.payouts.paidAt')}</Label>
          <Input
            id="sp-date"
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={busy || amount.trim() === '' || reference.trim() === ''}>
        {t('s16Settlement.payouts.record')}
      </Button>
    </form>
  );
}

/** Voids a recorded payout. */
export function VoidPayout({ id, version }: { id: string; version: number }): JSX.Element {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const reply = await send(`/api/integrations/settlement/payouts/${id}`, 'PATCH', {
      reason,
      version,
    });
    if (!reply.ok) setError(reply.text);
    else router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-sp-4">
      <Input
        aria-label={t('s16Settlement.payouts.voidReason')}
        placeholder={t('s16Settlement.payouts.voidReason')}
        className="h-8 w-48"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={busy || reason.trim().length < 5}
        onClick={() => void run()}
      >
        {t('s16Settlement.payouts.void')}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Removes one version of the terms. */
export function RemoveTerms({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const reply = await send(`/api/integrations/settlement/terms/${id}`, 'DELETE');
    if (!reply.ok) setError(reply.text);
    else router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {t('s16Settlement.terms.remove')}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
