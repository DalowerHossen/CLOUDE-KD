// path: components/settings/kyc-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { DOC_TYPES, MAX_DOC_BYTES, MIN_IMAGE, type DocType } from '@/lib/kyc/rules';
import { t, type StringKey } from '@/lib/i18n';
import type { KycView } from '@/services/kyc/owner';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
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

function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function KycPanel({
  view,
  endpoint = '/api/kyc',
}: {
  view: KycView;
  /** Where the panel saves; the sub-merchant verification uses its own address with the secure link in it. */
  endpoint?: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<DocType, string>>>({});
  const [expiry, setExpiry] = useState<Partial<Record<DocType, string>>>({});
  const [owners, setOwners] = useState<OwnerRow[]>(
    view.owners.length > 0 ? view.owners : [{ ...EMPTY_OWNER }],
  );
  const readOnly =
    view.status === 'submitted' || view.status === 'in_review' || view.status === 'approved';

  async function call(key: string, method: string, body: unknown, ok: string): Promise<boolean> {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage({ ok: true, text: ok });
        router.refresh();
        return true;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setMessage({
        ok: false,
        text: err.success ? err.data.error.message : t('s07Company.kyc.error'),
      });
    } catch {
      setMessage({ ok: false, text: t('s07Company.kyc.error') });
    } finally {
      setBusy(null);
    }
    return false;
  }

  async function upload(type: DocType, file: File): Promise<void> {
    if (file.size > MAX_DOC_BYTES)
      return setMessage({ ok: false, text: t('s07Company.kyc.tooBig') });
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))
      return setMessage({ ok: false, text: t('s07Company.kyc.wrongType') });
    if (file.type !== 'application/pdf') {
      const size = await imageSize(file);
      if (
        !size ||
        Math.max(size.width, size.height) < MIN_IMAGE.width ||
        Math.min(size.width, size.height) < MIN_IMAGE.height
      )
        return setMessage({
          ok: false,
          text: t('s07Company.kyc.tooSmall', { width: MIN_IMAGE.width, height: MIN_IMAGE.height }),
        });
      setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(file) }));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await call(
      type,
      'POST',
      {
        docType: type,
        name: file.name,
        mimeType: file.type,
        dataBase64: toBase64(bytes),
        expiresOn: expiry[type] || null,
      },
      t('s07Company.kyc.uploaded'),
    );
  }

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
          {DOC_TYPES.map((type) => {
            const doc = view.documents.find((d) => d.docType === type);
            const isId = type === 'id_front' || type === 'id_back';
            return (
              <li key={type} className="space-y-2 rounded-lg border p-sp-12 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {t(`s07Company.kyc.docs.${type}` as StringKey)}
                  </span>
                  {doc ? (
                    <Badge variant={doc.status === 'rejected' ? 'destructive' : 'outline'}>
                      {t(`s07Company.kyc.docState.${doc.status}` as StringKey)}
                    </Badge>
                  ) : null}
                </div>
                {doc ? <p className="text-muted-foreground">{doc.name}</p> : null}
                {doc?.rejectReason ? <p className="text-destructive">{doc.rejectReason}</p> : null}
                {previews[type] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[type]} alt="" className="max-h-32 rounded-md border" />
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
                        {...(isId ? { capture: 'environment' as const } : {})}
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
              </li>
            );
          })}
        </ul>
      </section>

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
                    {COUNTRY_CODES.map((c) => (
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
        </form>
      </section>

      {!readOnly ? (
        <section className="space-y-2">
          <Button
            type="button"
            disabled={!view.ready || busy !== null}
            onClick={() => void call('submit', 'PATCH', {}, t('s07Company.kyc.submitted'))}
          >
            {t('s07Company.kyc.submit')}
          </Button>
          {!view.ready ? (
            <p className="text-sm text-muted-foreground">{t('s07Company.kyc.notReady')}</p>
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
