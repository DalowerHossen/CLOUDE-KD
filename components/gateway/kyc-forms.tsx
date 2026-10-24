// path: components/gateway/kyc-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { t, type StringKey } from '@/lib/i18n';
import type { KycCase } from '@/services/gateway/kyc-review';

interface Failure {
  error?: { code?: string; message?: string };
}

type Reply = { ok: true; data: unknown } | { ok: false; text: string };

async function send(
  endpoint: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown>,
): Promise<Reply> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as Failure | null;
      return {
        ok: false,
        text:
          json?.error?.code === 'step_up_required'
            ? t('s16Gateway.common.needStepUp')
            : (json?.error?.message ?? t('s16Gateway.kyc.failed')),
      };
    }
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return { ok: true, data: json?.data ?? null };
  } catch {
    return { ok: false, text: t('s16Gateway.kyc.failed') };
  }
}

/** Makes the secure verification link of a sub-merchant. The link is shown once. */
export function KycLinkButton({ subMerchantId }: { subMerchantId: string }): JSX.Element {
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make(): Promise<void> {
    setBusy(true);
    setError(null);
    const reply = await send(
      `/api/integrations/gateway/sub-merchants/${subMerchantId}/kyc-link`,
      'POST',
      { expiresInDays: Number.parseInt(days, 10) || 14 },
    );
    if (!reply.ok) setError(reply.text);
    else {
      const path = (reply.data as { path?: unknown } | null)?.path;
      setLink(typeof path === 'string' ? `${window.location.origin}${path}` : null);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8">
      <div className="flex flex-wrap items-end gap-sp-8">
        <div className="space-y-1">
          <Label htmlFor={`kl-days-${subMerchantId}`}>{t('s16Gateway.kyc.linkDays')}</Label>
          <Input
            id={`kl-days-${subMerchantId}`}
            className="w-24"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void make()}
        >
          {t('s16Gateway.kyc.makeLink')}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {link ? (
        <Alert variant="success" role="status">
          <p className="font-medium">{t('s16Gateway.kyc.linkTitle')}</p>
          <p className="text-sm">{t('s16Gateway.kyc.linkHelp')}</p>
          <code className="mt-1 block break-all rounded bg-muted p-2 text-sm">{link}</code>
        </Alert>
      ) : null}
    </div>
  );
}

/** The business details of the applicant (name and country). */
export function BusinessForm({
  token,
  initialName,
  initialCountry,
  locked,
}: {
  token: string;
  initialName: string;
  initialCountry: string;
  locked: boolean;
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState(initialCountry);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const reply = await send(`/api/gateway-kyc/${token}/business`, 'PUT', {
      businessName: name,
      country,
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Gateway.applicant.businessSaved') });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      <fieldset disabled={locked || busy} className="space-y-sp-12">
        <div className="space-y-1">
          <Label htmlFor="ab-name">{t('s16Gateway.applicant.businessName')}</Label>
          <Input
            id="ab-name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-country">{t('s16Gateway.applicant.country')}</Label>
          <NativeSelect
            id="ab-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">{t('s16Gateway.applicant.chooseCountry')}</option>
            {COUNTRY_CODES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" disabled={name.trim().length < 2 || country === ''}>
          {t('s16Gateway.applicant.saveBusiness')}
        </Button>
      </fieldset>
      {notice ? (
        <p
          role="status"
          className={`text-sm ${notice.ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {notice.text}
        </p>
      ) : null}
    </form>
  );
}

/** The review of one case by the main merchant. */
export function ReviewPanel({ detail }: { detail: KycCase }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [risk, setRisk] = useState<string>(detail.risk ?? '');
  const [note, setNote] = useState(detail.reviewNote);
  const [reason, setReason] = useState('');
  const [hand, setHand] = useState(false);
  const base = `/api/integrations/gateway/kyc/${detail.id}`;

  async function act(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setNotice(null);
    const reply = await send(`${base}/action`, 'POST', body);
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Gateway.kyc.done') });
      router.refresh();
    }
    setBusy(false);
  }

  const inReview = detail.status === 'in_review';
  return (
    <div className="space-y-sp-16">
      <section className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-sp-8">
          <Badge variant="outline">
            {t(`s16Gateway.kyc.states.${detail.status}` as StringKey)}
          </Badge>
          <span>
            {t('s16Gateway.kyc.screening')}:{' '}
            {t(`s16Gateway.kyc.screeningStates.${detail.screeningStatus}` as StringKey)}
          </span>
        </div>
        {detail.screeningSummary ? <p>{detail.screeningSummary}</p> : null}
        <p>
          <strong>{t('s16Gateway.kyc.business')}:</strong> {detail.businessName || '-'} (
          {t('s16Gateway.kyc.country')}: {detail.businessCountry || '-'})
        </p>
        {detail.decisionReason ? <p>{detail.decisionReason}</p> : null}
      </section>

      <section className="space-y-sp-8">
        <h3 className="font-medium">{t('s16Gateway.kyc.owners')}</h3>
        <ul className="space-y-1 text-sm">
          {detail.owners.map((o, i) => (
            <li key={i}>
              {t('s16Gateway.kyc.ownerLine', {
                name: o.fullName,
                born: o.dateOfBirth,
                nationality: o.nationality,
                percent: o.ownershipPercent,
                id: o.idNumber || '-',
              })}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-sp-8">
        <h3 className="font-medium">{t('s16Gateway.kyc.documents')}</h3>
        <ul className="space-y-sp-8 text-sm">
          {detail.documents.map((d) => (
            <li key={d.id} className="space-y-1 rounded-md border p-sp-8">
              <div className="flex flex-wrap items-center gap-sp-8">
                <span className="font-medium">
                  {t(`s16Gateway.kyc.docNames.${d.docType}` as StringKey)}
                </span>
                <Badge variant={d.status === 'rejected' ? 'destructive' : 'outline'}>
                  {t(`s16Gateway.kyc.docStates.${d.status}` as StringKey)}
                </Badge>
                <a
                  className="underline"
                  href={`${base}/document/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('s16Gateway.kyc.view')}
                </a>
              </div>
              {d.rejectReason ? <p className="text-destructive">{d.rejectReason}</p> : null}
              {inReview ? (
                <div className="flex flex-wrap items-end gap-sp-8">
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`dr-${d.id}`}>{t('s16Gateway.kyc.docReason')}</Label>
                    <Input
                      id={`dr-${d.id}`}
                      maxLength={500}
                      value={reasons[d.id] ?? ''}
                      onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: 'documents',
                        documents: [{ id: d.id, status: 'accepted', reason: '' }],
                      })
                    }
                  >
                    {t('s16Gateway.kyc.accept')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy || (reasons[d.id] ?? '').trim().length < 3}
                    onClick={() =>
                      void act({
                        action: 'documents',
                        documents: [{ id: d.id, status: 'rejected', reason: reasons[d.id] ?? '' }],
                      })
                    }
                  >
                    {t('s16Gateway.kyc.rejectDoc')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {detail.status === 'submitted' ? (
        <Button type="button" disabled={busy} onClick={() => void act({ action: 'start' })}>
          {t('s16Gateway.kyc.start')}
        </Button>
      ) : null}

      {inReview ? (
        <section className="space-y-sp-12">
          <div className="grid gap-sp-8 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rv-risk">{t('s16Gateway.kyc.riskLevel')}</Label>
              <NativeSelect id="rv-risk" value={risk} onChange={(e) => setRisk(e.target.value)}>
                <option value="">-</option>
                {(['low', 'medium', 'high'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`s16Gateway.kyc.riskLevels.${r}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="rv-note">{t('s16Gateway.kyc.note')}</Label>
              <Textarea
                id="rv-note"
                rows={3}
                maxLength={4000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act({ action: 'note', risk: risk === '' ? null : risk, note })}
          >
            {t('s16Gateway.kyc.saveNote')}
          </Button>

          {detail.screeningStatus !== 'clear' && detail.screeningStatus !== 'hits' ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={hand} onChange={(e) => setHand(e.target.checked)} />
              <span>{t('s16Gateway.kyc.handChecked')}</span>
            </label>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="rv-reason">{t('s16Gateway.kyc.reasonForApplicant')}</Label>
            <Textarea
              id="rv-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-sp-8 sm:flex-row">
            <Button
              type="button"
              disabled={busy || detail.screeningStatus === 'hits'}
              onClick={() => void act({ action: 'approve', screeningCheckedByHand: hand })}
            >
              {t('s16Gateway.kyc.approve')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void act({ action: 'request_changes', reason })}
            >
              {t('s16Gateway.kyc.requestChanges')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void act({ action: 'reject', reason })}
            >
              {t('s16Gateway.kyc.reject')}
            </Button>
          </div>
        </section>
      ) : null}
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${notice.ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
