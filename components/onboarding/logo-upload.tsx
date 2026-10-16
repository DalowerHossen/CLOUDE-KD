// path: components/onboarding/logo-upload.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { t } from '@/lib/i18n';

const MAX_BYTES = 1_000_000;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const errorBody = z.object({ error: z.object({ message: z.string() }) });

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Choose or drop an image; it is uploaded at once and shown. The logo is stored by the server (encrypted). */
export function LogoUpload({
  hasLogo,
  onUploaded,
}: {
  hasLogo: boolean;
  onUploaded: () => void;
}): JSX.Element {
  const [version, setVersion] = useState(0);
  const [shown, setShown] = useState(hasLogo);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    if (!TYPES.includes(file.type)) {
      setMessage(t('s07Company.onboarding.logo.wrongType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage(t('s07Company.onboarding.logo.tooBig'));
      return;
    }
    setBusy(true);
    setMessage(t('s07Company.onboarding.logo.uploading'));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/companies/logo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type, dataBase64: toBase64(bytes) }),
      });
      if (response.ok) {
        setMessage(null);
        setShown(true);
        setVersion((v) => v + 1);
        onUploaded();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s07Company.onboarding.error'));
      }
    } catch {
      setMessage(t('s07Company.onboarding.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-sp-12">
      {shown ? (
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/companies/logo?v=${version}`}
            alt=""
            className="max-h-24 max-w-full rounded-md border bg-white p-2"
          />
          <figcaption className="text-caption text-muted-foreground">
            {t('s07Company.onboarding.logo.current')}
          </figcaption>
        </figure>
      ) : null}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-sp-16 text-center text-sm ${dragging ? 'border-primary bg-primary/5' : ''}`}
      >
        <span>{t('s07Company.onboarding.logo.drop')}</span>
        <span className="rounded-md border px-3 py-1">
          {t('s07Company.onboarding.logo.choose')}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </label>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
