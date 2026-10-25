// path: app/(admin)/admin/kyc/_components/review-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';
import type { ReviewDetail } from '@/services/kyc/review';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function ReviewPanel({
  detail,
  canReview,
}: {
  detail: ReviewDetail;
  canReview: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState(detail.reviewNote);
  const [risk, setRisk] = useState(detail.risk ?? '');
  const [reason, setReason] = useState('');
  const [handChecked, setHandChecked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const reviewing = detail.status === 'in_review';

  async function act(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/kyc/review/${detail.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage({ ok: true, text: t('s07Company.kycAdmin.done') });
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setMessage({
          ok: false,
          text: err.success ? err.data.error.message : t('s07Company.kycAdmin.error'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s07Company.kycAdmin.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-sp-24">
      <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 text-sm sm:grid-cols-2">
        <p>
          <strong>{t('s07Company.kycAdmin.company')}</strong> {detail.companyName}
        </p>
        <p>
          <strong>{t('s07Company.kycAdmin.state')}</strong>{' '}
          <Badge variant="outline">{detail.status}</Badge>
        </p>
        <p>
          <strong>{t('s07Company.kycAdmin.round')}</strong> {detail.round}
        </p>
        <p>
          <strong>{t('s07Company.kycAdmin.screening')}</strong>{' '}
          {t(`s07Company.kycAdmin.screeningState.${detail.screeningStatus}` as StringKey)}{' '}
          {detail.screeningSummary}
        </p>
        {detail.duplicate ? (
          <p role="alert" className="text-destructive sm:col-span-2">
            {t('s07Company.kycAdmin.duplicate')}
          </p>
        ) : null}
        {detail.awaitingApproval ? (
          <p className="sm:col-span-2">{t('s07Company.kycAdmin.awaiting')}</p>
        ) : null}
      </section>

      <section className="space-y-sp-12" aria-labelledby="docs">
        <h2 id="docs" className="text-h4 font-semibold">
          {t('s07Company.kycAdmin.documents')}
        </h2>
        <p className="text-caption text-muted-foreground">{t('s07Company.kycAdmin.viewLogged')}</p>
        <ul className="space-y-sp-12">
          {detail.documents.map((d) => (
            <li key={d.id} className="space-y-2 rounded-lg border p-sp-12 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t(`s07Company.kyc.docs.${d.docType}` as StringKey)}
                </span>
                <Badge variant={d.status === 'rejected' ? 'destructive' : 'outline'}>
                  {t(`s07Company.kyc.docState.${d.status}` as StringKey)}
                </Badge>
                {d.duplicate ? (
                  <Badge variant="destructive">{t('s07Company.kycAdmin.sameContent')}</Badge>
                ) : null}
                {d.expiresOn ? (
                  <span className="text-muted-foreground">
                    {t('s07Company.kycAdmin.validTo', { date: d.expiresOn })}
                  </span>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                >
                  {open === d.id ? t('s07Company.kycAdmin.hide') : t('s07Company.kycAdmin.view')}
                </Button>
              </div>
              {open === d.id ? (
                d.mimeType === 'application/pdf' ? (
                  <iframe
                    title={d.name}
                    src={`/api/kyc/review/documents/${d.id}`}
                    className="h-96 w-full rounded-md border"
                    sandbox=""
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/kyc/review/documents/${d.id}`}
                    alt={d.name}
                    className="max-h-96 max-w-full rounded-md border"
                  />
                )
              ) : null}
              {d.rejectReason ? <p className="text-destructive">{d.rejectReason}</p> : null}
              {canReview && reviewing ? (
                <div className="flex flex-wrap items-end gap-2">
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
                    {t('s07Company.kycAdmin.accept')}
                  </Button>
                  <Input
                    aria-label={t('s07Company.kycAdmin.rejectReason')}
                    placeholder={t('s07Company.kycAdmin.rejectReason')}
                    className="max-w-xs"
                    maxLength={500}
                    value={reasons[d.id] ?? ''}
                    onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || (reasons[d.id] ?? '').length < 3}
                    onClick={() =>
                      void act({
                        action: 'documents',
                        documents: [{ id: d.id, status: 'rejected', reason: reasons[d.id] ?? '' }],
                      })
                    }
                  >
                    {t('s07Company.kycAdmin.rejectDoc')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-sp-12" aria-labelledby="owners">
        <h2 id="owners" className="text-h4 font-semibold">
          {t('s07Company.kycAdmin.owners')}
        </h2>
        <ul className="space-y-1 text-sm">
          {detail.owners.map((o, i) => (
            <li key={i} className="rounded-md border p-sp-12">
              {o.fullName} - {o.nationality} - {o.dateOfBirth} - {o.ownershipPercent}%{' '}
              {o.idNumber ? `- ${o.idNumber}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {Object.keys(detail.business).length > 0 ? (
        <section className="space-y-sp-12" aria-labelledby="business">
          <h2 id="business" className="text-h4 font-semibold">
            {t('s07Company.kyc.businessTitle')}
          </h2>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(detail.business).map(([key, value]) => (
              <div key={key} className="rounded-md border p-sp-12">
                <dt className="text-muted-foreground">
                  {t(`s07Company.kyc.fields.${key}` as StringKey)}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {canReview ? (
        <section className="space-y-sp-12" aria-labelledby="decide">
          <h2 id="decide" className="text-h4 font-semibold">
            {t('s07Company.kycAdmin.decide')}
          </h2>
          {detail.status === 'submitted' ? (
            <Button type="button" disabled={busy} onClick={() => void act({ action: 'start' })}>
              {t('s07Company.kycAdmin.start')}
            </Button>
          ) : null}
          {reviewing ? (
            <>
              <div className="grid gap-sp-12 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t('s07Company.kycAdmin.risk')}</span>
                  <NativeSelect value={risk} onChange={(e) => setRisk(e.target.value)}>
                    <option value="">-</option>
                    <option value="low">{t('s07Company.kycAdmin.low')}</option>
                    <option value="medium">{t('s07Company.kycAdmin.medium')}</option>
                    <option value="high">{t('s07Company.kycAdmin.high')}</option>
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>{t('s07Company.kycAdmin.note')}</span>
                  <Textarea
                    rows={3}
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void act({ action: 'note', risk: risk || null, note })}
              >
                {t('s07Company.kycAdmin.saveNote')}
              </Button>
              <label className="block space-y-1 text-sm">
                <span>{t('s07Company.kycAdmin.reasonForOwner')}</span>
                <Textarea
                  rows={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                {detail.screeningStatus !== 'clear' ? (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={handChecked}
                      onChange={(e) => setHandChecked(e.target.checked)}
                    />
                    <span>{t('s07Company.kycAdmin.handChecked')}</span>
                  </label>
                ) : null}
                <Button
                  type="button"
                  disabled={busy || detail.awaitingApproval}
                  onClick={() =>
                    void act({ action: 'recommend', screeningCheckedByHand: handChecked })
                  }
                >
                  {t('s07Company.kycAdmin.recommend')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || reason.length < 5}
                  onClick={() => void act({ action: 'request_changes', reason })}
                >
                  {t('s07Company.kycAdmin.requestChanges')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || reason.length < 5}
                  onClick={() => void act({ action: 'reject', reason })}
                >
                  {t('s07Company.kycAdmin.reject')}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">
                {t('s07Company.kycAdmin.recommendHelp')}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
      <p
        aria-live="polite"
        role="status"
        className={`text-sm ${message && !message.ok ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
