// path: app/(admin)/admin/analytics/_components/pixels-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PIXEL_KEYS, PROVIDERS, type PixelSettings } from '@/lib/analytics/providers';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function PixelsForm({ initial }: { initial: PixelSettings }): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<PixelSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/analytics/pixels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (response.ok) {
        setMessage(t('s06Public.analyticsAdmin.saved'));
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(
          parsed.success ? parsed.data.error.message : t('s06Public.analyticsAdmin.error'),
        );
      }
    } catch {
      setMessage(t('s06Public.analyticsAdmin.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-sp-12 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {PIXEL_KEYS.map((key) => (
        <label key={key} className="block space-y-1 text-sm">
          <span>
            {PROVIDERS[key].label} ({t(`s06Public.analyticsAdmin.${PROVIDERS[key].category}`)})
          </span>
          <Input
            value={values[key]}
            maxLength={40}
            onChange={(e) => setValues({ ...values, [key]: e.target.value.trim() })}
          />
        </label>
      ))}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s06Public.cms.save')}
        </Button>
        <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}
