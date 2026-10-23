// path: app/(admin)/admin/cms/_components/media-picker.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const MAX_BYTES = 3_500_000;
const listBody = z.object({
  data: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
const errorBody = z.object({ error: z.object({ message: z.string() }) });

function toBase64(bytes: Uint8Array): string {
  let text = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    text += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(text);
}

/** Shows the chosen image, lists the media library and uploads new images. */
export function MediaPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}): JSX.Element {
  const [items, setItems] = useState<{ id: string; name: string }[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const response = await fetch('/api/cms/media');
    const parsed = listBody.safeParse(await response.json().catch(() => null));
    setItems(parsed.success ? parsed.data.data : []);
  }

  async function upload(file: File): Promise<void> {
    if (file.size > MAX_BYTES) {
      setMessage(t('s06Public.cms.sizeError'));
      return;
    }
    setBusy(true);
    setMessage(t('s06Public.cms.uploading'));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/cms/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: toBase64(bytes),
        }),
      });
      if (response.ok) {
        setMessage(null);
        await load();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s06Public.cms.error'));
      }
    } catch {
      setMessage(t('s06Public.cms.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {/^[0-9a-f-]{36}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/cms/media/${value}`} alt="" className="max-h-40 rounded-md border" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          {t('s06Public.cms.pickImage')}
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1 text-sm">
          <span>{t('s06Public.cms.upload')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
      {items !== null ? (
        items.length === 0 ? (
          <p className="text-muted-foreground">{t('s06Public.cms.noMedia')}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`w-full rounded-md border p-1 ${m.id === value ? 'ring-2 ring-ring' : ''}`}
                  onClick={() => onChange(m.id)}
                  title={m.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cms/media/${m.id}`}
                    alt={m.name}
                    className="h-16 w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
