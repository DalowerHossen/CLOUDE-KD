// path: components/settings/kyc-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { countryName, sortedCountryCodes } from '@/lib/company/countries';
import { MAX_PDF_BYTES, prepareImage } from '@/lib/kyc/image-prep';
import { BUSINESS_FIELDS, DEFAULT_REQUIRED_DOCUMENTS, type KycDocType } from '@/lib/kyc/profile';
import { MIN_IMAGE } from '@/lib/kyc/rules';
import { t, type StringKey } from '@/lib/i18n';
import type { KycView } from '@/services/kyc/owner';

const errorBody = z.object({
  error: z.object({ message: z.string(), correlation_id: z.string().nullish() }),
});
type OwnerRow = KycView['owners'][number];
const EMPTY_OWNER: OwnerRow = {
  fullName: '',
  dateOfBirth: '',
  nationality: '',
  ownershipPercent: '100',
  idNumber: '',
};

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function KycPanel({
  view,
  endpoint = '/api/kyc',
  previewBase = '/api/kyc/documents',
}: {
  view: KycView;
  /** Where the panel saves; the sub-merchant verification uses its own address with the secure link in it. */
  endpoint?: string;
  /** Where an uploaded document is shown from; empty when the screen has no such address. */
  previewBase?: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [previews, setPreviews] = useState<Partial<Record<KycDocType, string>>>({});
  const [expiry, setExpiry] = useState<Partial<Record<KycDocType, string>>>({});
  const form = view.form;
  const required: readonly KycDocType[] = form?.required ?? DEFAULT_REQUIRED_DOCUMENTS;
  const optional: readonly KycDocType[] = form?.optional ?? [];
  const shownDocs: readonly KycDocType[] = [...required, ...optional];
  const questions = BUSINESS_FIELDS.filter((f) => form?.businessFields.includes(f.id));
  const [answers, setAnswers] = useState<Record<string, string>>(form?.business ?? {});
  const [owners, setOwners] = useState<OwnerRow[]>(
    view.owners.length > 0 ? view.owners : [{ ...EMPTY_OWNER }],
  );
  const readOnly =
    view.status === 'submitted' || view.status === 'in_review' || view.status === 'approved';

  const note = (scope: string, ok: boolean, text: string): void =>
    setNotes((n) => ({ ...n, [scope]: { ok, text } }));

  async function call(
    scope: string,
    method: string,
    body: unknown,
    ok: string,
    url: string = endpoint,
  ): Promise<boolean> {
    setBusy(scope);
    setNotes((n) => {
      const { [scope]: _gone, ...rest } = n;
      return rest;
    });
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        note(scope, true, ok);
        router.refresh();
        return true;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      const ref =
        err.success && err.data.error.correlation_id ? err.data.error.correlation_id : null;
      const base = err.success
        ? err.data.error.message
        : response.status === 413
          ? t('s07Company.kyc.tooBigForHost')
          : t('s07Company.kyc.error');
      note(
        scope,
        false,
        `${base}${ref ? ` ${t('s07Company.kyc.errorRef', { ref })}` : ` (HTTP ${response.status})`}`,
      );
    } catch {
      note(scope, false, t('s07Company.kyc.error'));
    } finally {
      setBusy(null);
    }
    return false;
  }

  async function upload(type: KycDocType, file: File): Promise<void> {
    const fail = (text: string): void => note(type, false, text);
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))
      return fail(t('s07Company.kyc.wrongType'));
    let sendBlob: Blob = file;
    let sendName = file.name;
    let sendMime = file.type;
    if (file.type === 'application/pdf') {
      if (file.size > MAX_PDF_BYTES) return fail(t('s07Company.kyc.pdfTooBig'));
    } else {
      setBusy(type);
      note(type, true, t('s07Company.kyc.preparing'));
      try {
        const prepared = await prepareImage(file);
        if (
          Math.max(prepared.originalWidth, prepared.originalHeight) < MIN_IMAGE.width ||
          Math.min(prepared.originalWidth, prepared.originalHeight) < MIN_IMAGE.height
        ) {
          setBusy(null);
          return fail(
            t('s07Company.kyc.tooSmall', { width: MIN_IMAGE.width, height: MIN_IMAGE.height }),
          );
        }
        sendBlob = prepared.blob;
        sendMime = 'image/jpeg';
        sendName = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
        setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(prepared.blob) }));
      } catch {
        setBusy(null);
        return fail(t('s07Company.kyc.unreadable'));
      }
    }
    const bytes = new Uint8Array(await sendBlob.arrayBuffer());
    await call(
      type,
      'POST',
      {
        docType: type,
        name: sendName,
        mimeType: sendMime,
        dataBase64: toBase64(bytes),
        expiresOn: expiry[type] || null,
      },
      t('s07Company.kyc.uploaded'),
    );
  }

  const docsDone = required.filter((d) =>
    view.documents.some((x) => x.docType === d && x.status !== 'rejected'),
  ).length;
  const ownersDone = view.owners.length > 0;
  const businessDone = questions.every((q) => (form?.business[q.id] ?? '').length > 0);
  const rejectedDocs = view.documents.some((d) => d.status === 'rejected');

  const banner = t(`s07Company.kyc.banner.${view.status}` as StringKey);
  return (
    <div className="space-y-sp-24">
      <section aria-live="polite" className="space-y-1 rounded-lg border bg-card p-sp-16">
        <div className="flex items-center gap-2">
          <h2 className="text-h4 font-semibold">{t('s07Company.kyc.statusTitle')}</h2>
          <Badge
            variant={
              view.status === 'approved'
                ? 'default'
                : view.status === 'rejected' || view.status === 'changes_requested'
                  ? 'destructive'
                  : 'outline'
            }
          >
            {t(`s07Company.kyc.state.${view.status}` as StringKey)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{banner}</p>
        {view.decisionReason ? (
          <p className="text-sm">
            <strong>{t('s07Company.kyc.reason')}</strong> {view.decisionReason}
          </p>
        ) : null}
        {view.expiresAt ? (
          <p className="text-sm text-muted-foreground">
            {t('s07Company.kyc.validUntil', { date: view.expiresAt.slice(0, 10) })}
          </p>
        ) : null}
      </section>

      <section className="space-y-sp-12" aria-labelledby="docs">
        <h2 id="docs" className="text-h4 font-semibold">
          {t('s07Company.kyc.documents')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('s07Company.kyc.documentsHelp')}</p>
        <ul className="grid gap-sp-12 md:grid-cols-2">
          {shownDocs.map((type) => {
            const doc = view.documents.find((d) => d.docType === type);
            const isId = type === 'id_front' || type === 'id_back' || type === 'selfie_with_id';
            return (
              <li key={type} className="space-y-2 rounded-lg border p-sp-12 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {t(`s07Company.kyc.docs.${type}` as StringKey)}
                    {optional.includes(type) ? ` ${t('s07Company.kyc.optionalTag')}` : ''}
                  </span>
                  {doc ? (
                    <Badge variant={doc.status === 'rejected' ? 'destructive' : 'outline'}>
                      {t(`s07Company.kyc.docState.${doc.status}` as StringKey)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t('s07Company.kyc.missing')}</Badge>
                  )}
                </div>
                {doc ? (
                  <p className="text-muted-foreground">
                    <span aria-hidden="true">[x] </span>
                    {t('s07Company.kyc.uploadedFile', { name: doc.name })}
                  </p>
                ) : null}
                {doc?.rejectReason ? <p className="text-destructive">{doc.rejectReason}</p> : null}
                {previews[type] || (doc && previewBase && doc.mimeType.startsWith('image/')) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[type] ?? `${previewBase}/${doc?.id ?? ''}`}
                    alt={t('s07Company.kyc.previewAlt', {
                      name: t(`s07Company.kyc.docs.${type}` as StringKey),
                    })}
                    className="max-h-48 w-auto rounded-md border"
                  />
                ) : null}
                {doc && previewBase && doc.mimeType === 'application/pdf' ? (
                  <a
                    className="inline-block underline"
                    href={`${previewBase}/${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('s07Company.kyc.openPdf')}
                  </a>
                ) : null}
                {!readOnly ? (
                  <>
                    {isId ? (
                      <label className="block space-y-1">
                        <span>{t('s07Company.kyc.expiresOn')}</span>
                        <Input
                          type="date"
                          value={expiry[type] ?? ''}
                          onChange={(e) => setExpiry({ ...expiry, [type]: e.target.value })}
                        />
                      </label>
                    ) : null}
                    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 py-1">
                      <span>{doc ? t('s07Company.kyc.replace') : t('s07Company.kyc.choose')}</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        disabled={busy !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void upload(type, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </>
                ) : null}
                {busy === type ? (
                  <p role="status" className="text-muted-foreground">
                    {t('s07Company.kyc.uploading')}
                  </p>
                ) : null}
                {notes[type] ? (
                  <p
                    role={notes[type].ok ? 'status' : 'alert'}
                    className={notes[type].ok ? 'text-muted-foreground' : 'text-destructive'}
                  >
                    {notes[type].text}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {questions.length > 0 ? (
        <section className="space-y-sp-12" aria-labelledby="business">
          <h2 id="business" className="text-h4 font-semibold">
            {t('s07Company.kyc.businessTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('s07Company.kyc.businessHelp')}</p>
          <form
            className="space-y-sp-12"
            onSubmit={(e) => {
              e.preventDefault();
              void call(
                'business',
                'PUT',
                answers,
                t('s07Company.kyc.businessSaved'),
                `${endpoint}/business`,
              );
            }}
          >
            <fieldset disabled={readOnly || busy !== null} className="grid gap-2 sm:grid-cols-2">
              {questions.map((q) => {
                const value = answers[q.id] ?? '';
                const set = (v: string): void => setAnswers((a) => ({ ...a, [q.id]: v }));
                const label = t(`s07Company.kyc.fields.${q.id}` as StringKey);
                return (
                  <label
                    key={q.id}
                    className={`space-y-1 text-sm ${q.kind === 'textarea' ? 'sm:col-span-2' : ''}`}
                  >
                    <span>{label}</span>
                    {q.kind === 'select' ? (
                      <NativeSelect required value={value} onChange={(e) => set(e.target.value)}>
                        <option value="">{t('s07Company.kyc.chooseOne')}</option>
                        {(q.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {t(`s07Company.kyc.options.${o}` as StringKey)}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : q.kind === 'country' ? (
                      <NativeSelect required value={value} onChange={(e) => set(e.target.value)}>
                        <option value="">{t('s07Company.kyc.chooseOne')}</option>
                        {sortedCountryCodes.map((c) => (
                          <option key={c} value={c}>
                            {countryName(c)}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : q.kind === 'textarea' ? (
                      <textarea
                        required
                        rows={3}
                        maxLength={q.max}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-full rounded-md border bg-background px-3 py-2"
                      />
                    ) : (
                      <Input
                        required
                        maxLength={q.max}
                        type={
                          q.kind === 'date'
                            ? 'date'
                            : q.kind === 'tel'
                              ? 'tel'
                              : q.kind === 'url'
                                ? 'url'
                                : 'text'
                        }
                        value={value}
                        onChange={(e) => set(e.target.value)}
                      />
                    )}
                  </label>
                );
              })}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm">
                  {t('s07Company.kyc.saveBusiness')}
                </Button>
              </div>
            </fieldset>
            {notes.business ? (
              <p
                role={notes.business.ok ? 'status' : 'alert'}
                className={
                  notes.business.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
                }
              >
                {notes.business.text}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="space-y-sp-12" aria-labelledby="owners">
        <h2 id="owners" className="text-h4 font-semibold">
          {t('s07Company.kyc.owners')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('s07Company.kyc.ownersHelp')}</p>
        <form
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void call('owners', 'PUT', { owners }, t('s07Company.kyc.ownersSaved'));
          }}
        >
          <fieldset disabled={readOnly || busy !== null} className="space-y-sp-12">
            {owners.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-sp-12 text-sm sm:grid-cols-2">
                <label className="space-y-1">
                  <span>{t('s07Company.kyc.ownerName')}</span>
                  <Input
                    required
                    maxLength={120}
                    value={o.fullName}
                    onChange={(e) =>
                      setOwners(
                        owners.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span>{t('s07Company.kyc.ownerBirth')}</span>
                  <Input
                    required
                    type="date"
                    value={o.dateOfBirth}
                    onChange={(e) =>
                      setOwners(
                        owners.map((x, j) => (j === i ? { ...x, dateOfBirth: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span>{t('s07Company.kyc.ownerNationality')}</span>
                  <NativeSelect
                    required
                    value={o.nationality}
                    onChange={(e) =>
                      setOwners(
                        owners.map((x, j) => (j === i ? { ...x, nationality: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">-</option>
                    {sortedCountryCodes.map((c) => (
                      <option key={c} value={c}>
                        {countryName(c)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="space-y-1">
                  <span>{t('s07Company.kyc.ownerPercent')}</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={o.ownershipPercent}
                    onChange={(e) =>
                      setOwners(
                        owners.map((x, j) =>
                          j === i ? { ...x, ownershipPercent: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span>{t('s07Company.kyc.ownerId')}</span>
                  <Input
                    maxLength={60}
                    value={o.idNumber}
                    onChange={(e) =>
                      setOwners(
                        owners.map((x, j) => (j === i ? { ...x, idNumber: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={owners.length === 1}
                    onClick={() => setOwners(owners.filter((_, j) => j !== i))}
                  >
                    {t('s07Company.settings.remove')}
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={owners.length >= 6}
                onClick={() => setOwners([...owners, { ...EMPTY_OWNER, ownershipPercent: '0' }])}
              >
                {t('s07Company.kyc.addOwner')}
              </Button>
              <Button type="submit" size="sm">
                {t('s07Company.kyc.saveOwners')}
              </Button>
            </div>
          </fieldset>
          {notes.owners ? (
            <p
              role={notes.owners.ok ? 'status' : 'alert'}
              className={
                notes.owners.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
              }
            >
              {notes.owners.text}
            </p>
          ) : null}
        </form>
      </section>

      {!readOnly ? (
        <section className="space-y-2 rounded-lg border bg-card p-sp-16" aria-labelledby="submit">
          <h2 id="submit" className="text-h4 font-semibold">
            {t('s07Company.kyc.stepsTitle')}
          </h2>
          <ul className="space-y-1 text-sm">
            <li>
              <span aria-hidden="true">{docsDone === required.length ? '[x]' : '[ ]'} </span>
              {t('s07Company.kyc.stepDocs', { done: docsDone, total: required.length })}
            </li>
            {questions.length > 0 ? (
              <li>
                <span aria-hidden="true">{businessDone ? '[x]' : '[ ]'} </span>
                {businessDone
                  ? t('s07Company.kyc.stepBusinessDone')
                  : t('s07Company.kyc.stepBusiness')}
              </li>
            ) : null}
            <li>
              <span aria-hidden="true">{ownersDone ? '[x]' : '[ ]'} </span>
              {ownersDone ? t('s07Company.kyc.stepOwnersDone') : t('s07Company.kyc.stepOwners')}
            </li>
            {rejectedDocs ? (
              <li className="text-destructive">{t('s07Company.kyc.stepReplace')}</li>
            ) : null}
          </ul>
          <Button
            type="button"
            disabled={!view.ready || rejectedDocs || busy !== null}
            onClick={() => void call('submit', 'PATCH', {}, t('s07Company.kyc.submitted'))}
          >
            {t('s07Company.kyc.submit')}
          </Button>
          {!view.ready ? (
            <p className="text-sm text-muted-foreground">{t('s07Company.kyc.notReady')}</p>
          ) : null}
          {notes.submit ? (
            <p
              role={notes.submit.ok ? 'status' : 'alert'}
              className={
                notes.submit.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
              }
            >
              {notes.submit.text}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
