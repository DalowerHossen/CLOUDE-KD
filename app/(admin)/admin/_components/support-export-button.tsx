// path: app/(admin)/admin/_components/support-export-button.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

const p = (k: string): string => t(`s16System.export.${k}` as never);
const okBody = z.object({ data: z.record(z.string(), z.unknown()) });
const errBody = z.object({
  error: z.object({ message: z.string(), correlation_id: z.string().optional() }),
});

export function SupportExportButton({
  companyId,
  slug,
}: {
  companyId: string;
  slug: string;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/system/tenant-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, reason }),
      });
      const json: unknown = await response.json().catch(() => null);
      const ok = okBody.safeParse(json);
      if (!response.ok || !ok.success) {
        const e = errBody.safeParse(json);
        setError(e.success ? e.data.error.message : p('error'));
        return;
      }
      const blob = new Blob([JSON.stringify(ok.data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `support-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setReason('');
    } catch {
      setError(p('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
      <h2 className="text-h4 font-semibold">{p('title')}</h2>
      <p className="text-sm text-muted-foreground">{p('help')}</p>
      <label className="block text-sm font-medium" htmlFor="export-reason">
        {p('reason')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="export-reason"
          className="min-w-0 flex-1"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || reason.trim().length < 10}
          onClick={() => void run()}
        >
          {p('download')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
