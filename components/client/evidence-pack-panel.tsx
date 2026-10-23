// path: components/client/evidence-pack-panel.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export interface PackRow {
  id: string;
  versionNo: number;
  createdAt: string;
  retainUntil: string;
  zipHash: string;
  processorFormat: boolean;
  missing: string[];
}

/** "Generate evidence pack" (one click) and the packs made so far, each with a PDF and a ZIP download. */
export function EvidencePackPanel({
  disputeId,
  packs,
  canGenerate,
  closed,
}: {
  disputeId: string;
  packs: PackRow[];
  canGenerate: boolean;
  closed: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function generate(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/disputes/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ disputeId }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s13Portal.pack.failed'));
      setNotice({ ok: true, text: t('s13Portal.pack.made') });
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s13Portal.pack.failed'),
      });
    }
    setBusy(false);
  }

  return (
    <section className="space-y-sp-8" aria-labelledby="pack-title">
      <h2 id="pack-title" className="font-semibold">
        {t('s13Portal.pack.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s13Portal.pack.help')}</p>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      {canGenerate && !closed ? (
        <Button type="button" disabled={busy} onClick={() => void generate()}>
          {busy ? t('s13Portal.pack.making') : t('s13Portal.pack.generate')}
        </Button>
      ) : null}
      {packs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s13Portal.pack.none')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {packs.map((p) => (
            <li key={p.id} className="space-y-1 rounded-md border p-sp-12 text-sm">
              <p className="font-semibold">
                {t('s13Portal.pack.version', { n: p.versionNo })} -{' '}
                {p.createdAt.replace('T', ' ').slice(0, 16)}
              </p>
              <p className="break-all text-caption text-muted-foreground">
                {t('s13Portal.pack.checksum', { value: p.zipHash })}
              </p>
              <p className="text-caption text-muted-foreground">
                {t('s13Portal.pack.kept', { date: p.retainUntil.slice(0, 10) })}
                {p.processorFormat ? ` - ${t('s13Portal.pack.hasFormat')}` : ''}
              </p>
              {p.missing.length > 0 ? (
                <p className="text-caption text-muted-foreground">
                  {t('s13Portal.pack.missing', { list: p.missing.join(', ') })}
                </p>
              ) : null}
              <div className="flex gap-sp-8">
                <Button asChild size="sm" variant="secondary">
                  <a href={`/api/disputes/evidence/${p.id}/pdf`}>
                    {t('s13Portal.pack.downloadPdf')}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/disputes/evidence/${p.id}/zip`}>
                    {t('s13Portal.pack.downloadZip')}
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
