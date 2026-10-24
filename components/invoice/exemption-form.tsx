// path: components/invoice/exemption-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { ExemptionView } from '@/services/tax/exemptions';
import { callJson } from './api-call';

const MAX_BYTES = 3_000_000;

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export function ExemptionForm({
  exemption,
  expired,
  canManage,
}: {
  exemption: ExemptionView;
  expired: boolean;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [s, setS] = useState(exemption);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const off = !canManage;

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const result = await callJson(`/api/invoices/tax/exemptions/${s.clientId}`, 'PUT', {
      expectedVersion: s.version,
      exemption: {
        taxExempt: s.taxExempt,
        reason: s.reason,
        certificateExpiresOn: s.certificateExpiresOn || null,
        clientTaxId: s.clientTaxId,
        clientTaxLabel: s.clientTaxLabel,
      },
    });
    if (result.ok) {
      setNote({ ok: true, text: t('s09Invoicing.tax.saved') });
      router.refresh();
    } else
      setNote({
        ok: false,
        text:
          result.status === 409
            ? t('s09Invoicing.tax.conflict')
            : (result.message ?? t('s09Invoicing.tax.error')),
      });
    setBusy(false);
  }

  async function upload(): Promise<void> {
    if (!file) return;
    if (file.size > MAX_BYTES) return setNote({ ok: false, text: t('s09Invoicing.tax.error') });
    setBusy(true);
    setNote(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await callJson(
      `/api/invoices/tax/exemptions/${s.clientId}/certificate`,
      'POST',
      {
        name: file.name,
        mimeType: file.type,
        dataBase64: toBase64(bytes),
      },
    );
    if (result.ok) {
      setNote({ ok: true, text: t('s09Invoicing.tax.saved') });
      setFile(null);
      router.refresh();
    } else setNote({ ok: false, text: result.message ?? t('s09Invoicing.tax.error') });
    setBusy(false);
  }

  const status =
    s.clientTaxId === ''
      ? ''
      : s.clientTaxIdValid === null
        ? t('s09Invoicing.tax.notVerified')
        : s.clientTaxIdValid
          ? t('s09Invoicing.tax.verified')
          : t('s09Invoicing.tax.invalid');
  return (
    <div className="space-y-sp-16">
      <form
        className="grid gap-sp-12 text-sm sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex items-center gap-sp-8 sm:col-span-2">
          <input
            type="checkbox"
            disabled={off}
            checked={s.taxExempt}
            onChange={(e) => setS({ ...s, taxExempt: e.target.checked })}
          />
          {t('s09Invoicing.tax.exempt')}
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.tax.reason')}
          <Input
            disabled={off}
            value={s.reason}
            maxLength={300}
            onChange={(e) => setS({ ...s, reason: e.target.value })}
          />
        </label>
        <label>
          {t('s09Invoicing.tax.certificateExpires')}
          <Input
            type="date"
            disabled={off}
            value={s.certificateExpiresOn ?? ''}
            onChange={(e) =>
              setS({ ...s, certificateExpiresOn: e.target.value === '' ? null : e.target.value })
            }
          />
        </label>
        <span />
        <label>
          {t('s09Invoicing.tax.clientTaxLabel')}
          <Input
            disabled={off}
            value={s.clientTaxLabel}
            maxLength={30}
            onChange={(e) => setS({ ...s, clientTaxLabel: e.target.value })}
          />
        </label>
        <label>
          {t('s09Invoicing.tax.clientTaxId')}
          <Input
            disabled={off}
            value={s.clientTaxId}
            maxLength={40}
            onChange={(e) => setS({ ...s, clientTaxId: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">{status}</span>
        </label>
        {expired ? (
          <p role="alert" className="text-destructive sm:col-span-2">
            {t('s09Invoicing.tax.certificateExpired')}
          </p>
        ) : null}
        {canManage ? (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('s09Invoicing.tax.saving') : t('s09Invoicing.tax.saveExemption')}
            </Button>
          </div>
        ) : null}
      </form>
      <div className="space-y-sp-8 text-sm">
        {exemption.certificateFileId ? (
          <a
            className="underline"
            href={`/api/invoices/tax/exemptions/${exemption.clientId}/certificate/file`}
          >
            {t('s09Invoicing.tax.certificateView')}
          </a>
        ) : null}
        {canManage ? (
          exemption.version === null ? (
            <p>{t('s09Invoicing.tax.certificateSaveFirst')}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-sp-8">
              <label>
                {t('s09Invoicing.tax.certificate')}
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="block"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !file}
                onClick={() => void upload()}
              >
                {t('s09Invoicing.tax.certificateUpload')}
              </Button>
            </div>
          )
        ) : null}
      </div>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
