// path: components/inventory/scan-panel.tsx
'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

const hitBody = z.object({
  data: z
    .object({
      productId: z.string(),
      variantId: z.string().nullable(),
      name: z.string(),
      variantName: z.string(),
      sku: z.string().nullable(),
      trackInventory: z.boolean(),
    })
    .nullable(),
});

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => DetectorLike;

/** Type or scan a barcode (a hardware scanner types it and presses Enter), or read it with the camera when the browser can. */
export function ScanPanel(): JSX.Element {
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<z.infer<typeof hitBody>['data']>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);

  async function find(value: string): Promise<void> {
    const clean = value.trim();
    if (clean === '') return;
    setBusy(true);
    setMessage(null);
    setHit(null);
    try {
      const response = await fetch(
        `/api/inventory/barcode?${new URLSearchParams({ code: clean }).toString()}`,
      );
      const parsed = hitBody.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) setMessage(t('s08Crm.scan.error'));
      else if (!parsed.data.data) setMessage(t('s08Crm.scan.notFound'));
      else setHit(parsed.data.data);
    } catch {
      setMessage(t('s08Crm.scan.error'));
    }
    setBusy(false);
  }

  async function camera(): Promise<void> {
    const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setMessage(t('s08Crm.scan.cameraUnsupported'));
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      stream.current = media;
      const el = video.current;
      if (!el) return;
      el.srcObject = media;
      await el.play();
      const detector = new Detector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      let attempts = 0;
      const tick = async (): Promise<void> => {
        attempts += 1;
        if (!stream.current || attempts > 200) return stop();
        const found = await detector.detect(el).catch(() => []);
        const value = found[0]?.rawValue;
        if (value) {
          stop();
          setCode(value);
          void find(value);
          return;
        }
        window.setTimeout(() => void tick(), 300);
      };
      void tick();
    } catch {
      setMessage(t('s08Crm.scan.cameraUnsupported'));
    }
  }

  function stop(): void {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  return (
    <div className="space-y-sp-12 text-sm">
      <form
        className="flex flex-wrap items-end gap-sp-8"
        onSubmit={(e) => {
          e.preventDefault();
          void find(code);
        }}
      >
        <label>
          <span className="block font-medium">{t('s08Crm.scan.code')}</span>
          <Input autoFocus value={code} maxLength={64} onChange={(e) => setCode(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy || code.trim() === ''}>
          {t('s08Crm.scan.find')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void camera()}>
          {t('s08Crm.scan.camera')}
        </Button>
      </form>
      <video ref={video} className="max-h-64 rounded-md" playsInline muted />
      {message ? (
        <p role="alert" className="text-destructive">
          {message}
        </p>
      ) : null}
      {hit ? (
        <section className="space-y-1 rounded-lg border bg-card p-sp-12">
          <p className="font-medium">
            {hit.name}
            {hit.variantName ? ` - ${hit.variantName}` : ''}
          </p>
          <p className="text-muted-foreground">{hit.sku ?? ''}</p>
          {!hit.trackInventory ? <p>{t('s08Crm.scan.notTracked')}</p> : null}
          <Link className="underline" href={`/products/${hit.productId}`}>
            {t('s08Crm.scan.openItem')}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
