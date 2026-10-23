// path: components/client/contract-signer.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { SignaturePad } from './signature-pad';

type Method = 'typed' | 'drawn' | 'uploaded';

interface ContractSignerProps {
  token: string;
  docHash: string;
  statement: string;
  defaultName: string;
}

const MAX_UPLOAD = 500_000;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

/** Sign (typed, drawn or an uploaded picture) or decline. The link goes in the request body, never in an address. */
export function ContractSigner({
  token,
  docHash,
  statement,
  defaultName,
}: ContractSignerProps): JSX.Element {
  const [method, setMethod] = useState<Method>('typed');
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'signed' | 'declined' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...body }),
        cache: 'no-store',
      });
      if (response.ok) return true;
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(json?.error?.message ?? t('s13Portal.sign.failed'));
    } catch {
      setError(t('s13Portal.sign.failed'));
    }
    setBusy(false);
    return false;
  }

  async function sign(): Promise<void> {
    if (name.trim().length < 2) return setError(t('s13Portal.sign.nameRequired'));
    if (method !== 'typed' && !image) return setError(t('s13Portal.sign.imageRequired'));
    if (!accepted) return setError(t('s13Portal.sign.acceptRequired'));
    if (
      await post('/api/portal/contract/sign', {
        docHash,
        method,
        typedName: name.trim(),
        image: method === 'typed' ? null : image,
        accepted: true,
      })
    )
      setDone('signed');
  }

  async function decline(): Promise<void> {
    if (reason.trim().length < 3) return setError(t('s13Portal.sign.reasonRequired'));
    if (await post('/api/portal/contract/decline', { reason: reason.trim() })) setDone('declined');
  }

  async function upload(file: File | undefined): Promise<void> {
    setError(null);
    if (!file) return setImage(null);
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > MAX_UPLOAD) {
      setImage(null);
      return setError(t('s13Portal.sign.uploadRule'));
    }
    try {
      setImage(await readFile(file));
    } catch {
      setError(t('s13Portal.sign.uploadRule'));
    }
  }

  if (done)
    return (
      <Alert variant={done === 'signed' ? 'success' : 'default'}>
        {done === 'signed' ? t('s13Portal.sign.thanksSigned') : t('s13Portal.sign.thanksDeclined')}
      </Alert>
    );

  const tabs: ReadonlyArray<readonly [Method, string]> = [
    ['typed', t('s13Portal.sign.typed')],
    ['drawn', t('s13Portal.sign.drawn')],
    ['uploaded', t('s13Portal.sign.uploaded')],
  ];

  return (
    <section className="space-y-sp-12 print:hidden" aria-labelledby="sign-title">
      <h2 id="sign-title" className="text-h4 font-semibold">
        {t('s13Portal.sign.title')}
      </h2>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="sign-name">{t('s13Portal.sign.nameLabel')}</Label>
        <Input
          id="sign-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoComplete="name"
          disabled={busy}
        />
      </div>
      <div role="group" aria-label={t('s13Portal.sign.methodLabel')} className="flex gap-sp-8">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={method === key ? 'default' : 'outline'}
            aria-pressed={method === key}
            disabled={busy}
            onClick={() => {
              setMethod(key);
              setImage(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {method === 'typed' ? (
        <p
          className="rounded-md border bg-white px-sp-12 py-sp-16 text-lead italic text-black"
          aria-live="polite"
        >
          {name.trim() || t('s13Portal.sign.typedPlaceholder')}
        </p>
      ) : null}
      {method === 'drawn' ? <SignaturePad onChange={setImage} disabled={busy} /> : null}
      {method === 'uploaded' ? (
        <div className="space-y-1">
          <Label htmlFor="sign-file">{t('s13Portal.sign.uploadLabel')}</Label>
          <input
            id="sign-file"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => void upload(e.target.files?.[0])}
            disabled={busy}
          />
          <p className="text-caption text-muted-foreground">{t('s13Portal.sign.uploadRule')}</p>
        </div>
      ) : null}
      <div className="flex items-start gap-sp-8">
        <Checkbox
          id="sign-accept"
          checked={accepted}
          onCheckedChange={(v) => setAccepted(v === true)}
          disabled={busy}
        />
        <Label htmlFor="sign-accept" className="text-sm font-normal">
          {statement}
        </Label>
      </div>
      <div className="flex flex-col gap-sp-8 sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="sm:flex-1"
          disabled={busy}
          onClick={() => void sign()}
        >
          {t('s13Portal.sign.submit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setDeclining(!declining)}
        >
          {t('s13Portal.sign.decline')}
        </Button>
      </div>
      {declining ? (
        <div className="space-y-1">
          <Label htmlFor="sign-reason">{t('s13Portal.sign.reasonLabel')}</Label>
          <Input
            id="sign-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void decline()}
          >
            {t('s13Portal.sign.confirmDecline')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
