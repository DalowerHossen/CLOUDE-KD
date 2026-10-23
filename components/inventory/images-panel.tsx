// path: components/inventory/images-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const MAX_BYTES = 1_500_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function ImagesPanel({
  productId,
  fileIds,
  canEdit,
}: {
  productId: string;
  fileIds: string[];
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(t('s08Crm.products.imageTooBig'));
      return;
    }
    const mime =
      file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp'
        ? file.type
        : null;
    if (!mime) {
      setError(t('s08Crm.products.imageError'));
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch(`/api/products/${productId}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: file.name.slice(0, 150),
          mimeType: mime,
          dataBase64: toBase64(bytes),
        }),
      });
      if (response.ok) router.refresh();
      else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.products.imageError'));
      }
    } catch {
      setError(t('s08Crm.products.imageError'));
    }
    setBusy(false);
  }

  async function remove(fileId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/products/${productId}/images`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      if (response.ok) router.refresh();
      else setError(t('s08Crm.products.imageError'));
    } catch {
      setError(t('s08Crm.products.imageError'));
    }
    setBusy(false);
  }

  return (
    <section
      className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm"
      aria-label={t('s08Crm.products.imagesTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s08Crm.products.imagesTitle')}</h2>
      <p className="text-muted-foreground">{t('s08Crm.products.imagesHelp')}</p>
      <ul className="flex flex-wrap gap-sp-8">
        {fileIds.map((f) => (
          <li key={f} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/products/${productId}/images/${f}`}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 rounded-md border object-cover"
            />
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void remove(f)}
              >
                {t('s08Crm.products.removeImage')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit && fileIds.length < 5 ? (
        <label className="block">
          <span className="block font-medium">{t('s08Crm.products.addImage')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
