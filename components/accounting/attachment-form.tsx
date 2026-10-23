// path: components/accounting/attachment-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';

const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'];
const MAX_BYTES = 8 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Adds a file (PDF, PNG, JPEG or CSV up to 8 MB) to a journal entry. */
export function AttachmentForm({ entryId }: { entryId: string }): JSX.Element {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setNotice(null);
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setNotice({ ok: false, text: 'Use a PDF, PNG, JPEG or CSV file of at most 8 MB.' });
      return;
    }
    try {
      const dataBase64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      const response = await fetch(`/api/accounting/journals/${entryId}/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type, dataBase64 }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
      setNotice({ ok: true, text: t('s15Accounting.journals.saved') });
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'),
      });
    }
  }
  return (
    <div className="space-y-1">
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.csv"
        aria-label={t('s15Accounting.journals.attachments')}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}
