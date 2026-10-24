// path: components/transfer/import-upload.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const okBody = z.object({ data: z.object({ id: z.string() }) });
const MAX_BYTES = 7_000_000;
const TARGETS = ['clients', 'products', 'suppliers'] as const;

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export function ImportUpload({
  allowed,
}: {
  allowed: readonly (typeof TARGETS)[number][];
}): JSX.Element {
  const router = useRouter();
  const [target, setTarget] = useState<(typeof TARGETS)[number]>(allowed[0] ?? 'clients');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(): Promise<void> {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t('s08Crm.transfer.tooBig'));
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, fileName: file.name, dataBase64: toBase64(bytes) }),
      });
      const json: unknown = await response.json().catch(() => null);
      const ok = okBody.safeParse(json);
      if (response.ok && ok.success) router.push(`/imports/${ok.data.data.id}`);
      else {
        const err = errorBody.safeParse(json);
        setError(err.success ? err.data.error.message : t('s08Crm.transfer.uploadError'));
      }
    } catch {
      setError(t('s08Crm.transfer.uploadError'));
    }
    setBusy(false);
  }

  if (allowed.length === 0) return <></>;
  return (
    <form
      className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        void upload();
      }}
    >
      <label>
        {t('s08Crm.transfer.target')}
        <NativeSelect
          value={target}
          onChange={(e) => setTarget(TARGETS.find((x) => x === e.target.value) ?? 'clients')}
        >
          {allowed.map((x) => (
            <option key={x} value={x}>
              {t(`s08Crm.transfer.targets.${x}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="sm:col-span-2">
        {t('s08Crm.transfer.file')}
        <input
          type="file"
          accept=".csv,.xlsx"
          required
          className="block w-full"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive sm:col-span-3">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={busy || !file}>
          {busy ? t('s08Crm.transfer.uploading') : t('s08Crm.transfer.upload')}
        </Button>
      </div>
    </form>
  );
}
