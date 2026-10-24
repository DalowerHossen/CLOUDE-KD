// path: components/client/contract-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

export interface ContractFormValues {
  title: string;
  clientId: string;
  templateKey: string;
  bodyHtml: string;
  amount: string;
  effectiveOn: string;
  endsOn: string;
  signBy: string;
  renewalNoticeDays: number;
  signingOrder: 'parallel' | 'sequential';
  terms: string;
  signers: { name: string; email: string; roleLabel: string }[];
}

interface ContractFormProps {
  /** Null for a new contract. */
  edit: { id: string; version: number } | null;
  initial: ContractFormValues;
  clients: { id: string; name: string }[];
  templates: { key: string; name: string; bodyHtml: string }[];
}

const blank = { name: '', email: '', roleLabel: '' };

/** Writes or edits a contract draft: wording (with merge fields), terms, dates and the people who sign. */
export function ContractForm({
  edit,
  initial,
  clients,
  templates,
}: ContractFormProps): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState<ContractFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ContractFormValues>): void => setV({ ...v, ...patch });

  function chooseTemplate(key: string): void {
    const found = templates.find((x) => x.key === key);
    if (!found) {
      set({ templateKey: '' });
      return;
    }
    if (v.bodyHtml.trim() !== '' && !window.confirm(t('s13Portal.contracts.replaceWording')))
      return;
    set({ templateKey: key, bodyHtml: found.bodyHtml, title: v.title || found.name });
  }

  function setSigner(index: number, patch: Partial<typeof blank>): void {
    set({ signers: v.signers.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const contract = {
      title: v.title.trim(),
      clientId: v.clientId || null,
      templateKey: v.templateKey || null,
      bodyHtml: v.bodyHtml,
      amount: v.amount.trim() === '' ? null : v.amount.trim(),
      effectiveOn: v.effectiveOn || null,
      endsOn: v.endsOn || null,
      signBy: v.signBy || null,
      renewalNoticeDays: v.renewalNoticeDays,
      signingOrder: v.signingOrder,
      terms: v.terms,
      signers: v.signers.map((s) => ({
        name: s.name.trim(),
        email: s.email.trim(),
        roleLabel: s.roleLabel.trim(),
      })),
    };
    try {
      const response = await fetch(edit ? `/api/contracts/${edit.id}` : '/api/contracts', {
        method: edit ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(edit ? { expectedVersion: edit.version, contract } : contract),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data?.id) {
        setError(json?.error?.message ?? t('s13Portal.contracts.saveFailed'));
        setBusy(false);
        return;
      }
      router.push(`/contracts/${json.data.id}`);
      router.refresh();
    } catch {
      setError(t('s13Portal.contracts.saveFailed'));
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-title">{t('s13Portal.contracts.title')}</Label>
          <Input
            id="c-title"
            value={v.title}
            onChange={(e) => set({ title: e.target.value })}
            maxLength={200}
            required
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-client">{t('s13Portal.contracts.client')}</Label>
          <NativeSelect
            id="c-client"
            value={v.clientId}
            onChange={(e) => set({ clientId: e.target.value })}
            disabled={busy}
          >
            <option value="">{t('s13Portal.contracts.noClient')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-template">{t('s13Portal.contracts.template')}</Label>
          <NativeSelect
            id="c-template"
            value={v.templateKey}
            onChange={(e) => chooseTemplate(e.target.value)}
            disabled={busy}
          >
            <option value="">{t('s13Portal.contracts.blank')}</option>
            {templates.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-amount">{t('s13Portal.contracts.amount')}</Label>
          <Input
            id="c-amount"
            inputMode="decimal"
            value={v.amount}
            onChange={(e) => set({ amount: e.target.value })}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-start">{t('s13Portal.contracts.effectiveOn')}</Label>
          <Input
            id="c-start"
            type="date"
            value={v.effectiveOn}
            onChange={(e) => set({ effectiveOn: e.target.value })}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-end">{t('s13Portal.contracts.endsOn')}</Label>
          <Input
            id="c-end"
            type="date"
            value={v.endsOn}
            onChange={(e) => set({ endsOn: e.target.value })}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-signby">{t('s13Portal.contracts.signBy')}</Label>
          <Input
            id="c-signby"
            type="date"
            value={v.signBy}
            onChange={(e) => set({ signBy: e.target.value })}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-renew">{t('s13Portal.contracts.renewalNotice')}</Label>
          <Input
            id="c-renew"
            type="number"
            min={0}
            max={365}
            value={v.renewalNoticeDays}
            onChange={(e) => set({ renewalNoticeDays: Number(e.target.value) || 0 })}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-order">{t('s13Portal.contracts.order')}</Label>
          <NativeSelect
            id="c-order"
            value={v.signingOrder}
            onChange={(e) => set({ signingOrder: e.target.value as 'parallel' | 'sequential' })}
            disabled={busy}
          >
            <option value="parallel">{t('s13Portal.contracts.orderParallel')}</option>
            <option value="sequential">{t('s13Portal.contracts.orderSequential')}</option>
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-body">{t('s13Portal.contracts.wording')}</Label>
        <Textarea
          id="c-body"
          value={v.bodyHtml}
          onChange={(e) => set({ bodyHtml: e.target.value })}
          rows={14}
          maxLength={200000}
          required
          disabled={busy}
          className="font-mono text-sm"
        />
        <p className="text-caption text-muted-foreground">{t('s13Portal.contracts.mergeHelp')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-terms">{t('s13Portal.contracts.terms')}</Label>
        <Textarea
          id="c-terms"
          value={v.terms}
          onChange={(e) => set({ terms: e.target.value })}
          rows={4}
          maxLength={5000}
          disabled={busy}
        />
      </div>
      <fieldset className="space-y-sp-8">
        <legend className="text-sm font-semibold">{t('s13Portal.contracts.signers')}</legend>
        {v.signers.map((s, index) => (
          <div key={index} className="grid gap-sp-8 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input
              aria-label={t('s13Portal.contracts.signerName')}
              placeholder={t('s13Portal.contracts.signerName')}
              value={s.name}
              onChange={(e) => setSigner(index, { name: e.target.value })}
              maxLength={200}
              required
              disabled={busy}
            />
            <Input
              aria-label={t('s13Portal.contracts.signerEmail')}
              placeholder={t('s13Portal.contracts.signerEmail')}
              type="email"
              value={s.email}
              onChange={(e) => setSigner(index, { email: e.target.value })}
              maxLength={254}
              required
              disabled={busy}
            />
            <Input
              aria-label={t('s13Portal.contracts.signerRole')}
              placeholder={t('s13Portal.contracts.signerRole')}
              value={s.roleLabel}
              onChange={(e) => setSigner(index, { roleLabel: e.target.value })}
              maxLength={80}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || v.signers.length === 1}
              onClick={() => set({ signers: v.signers.filter((_, i) => i !== index) })}
            >
              {t('s13Portal.contracts.removeSigner')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || v.signers.length >= 10}
          onClick={() => set({ signers: [...v.signers, { ...blank }] })}
        >
          {t('s13Portal.contracts.addSigner')}
        </Button>
      </fieldset>
      <Button type="submit" disabled={busy}>
        {t('s13Portal.contracts.saveDraft')}
      </Button>
    </form>
  );
}
