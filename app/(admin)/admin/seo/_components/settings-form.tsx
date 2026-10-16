// path: app/(admin)/admin/seo/_components/settings-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { SeoSettings } from '@/lib/seo/settings';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

const groups = [
  { key: 'verification', labelKey: 's06Public.seoAdmin.verification' },
  { key: 'social', labelKey: 's06Public.seoAdmin.social' },
  { key: 'organization', labelKey: 's06Public.seoAdmin.organization' },
] as const;

export function SettingsForm({ initial }: { initial: SeoSettings }): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<SeoSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set(group: keyof SeoSettings, field: string, value: string): void {
    setValues({ ...values, [group]: { ...values[group], [field]: value } });
  }

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/seo/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (response.ok) {
        setMessage(t('s06Public.seoAdmin.saved'));
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s06Public.seoAdmin.error'));
      }
    } catch {
      setMessage(t('s06Public.seoAdmin.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {groups.map((g) => (
        <fieldset key={g.key} className="space-y-2 rounded-md border p-sp-12">
          <legend className="px-1 text-sm font-medium">{t(g.labelKey)}</legend>
          {Object.entries(values[g.key]).map(([field, value]) => (
            <label key={field} className="block space-y-1 text-sm">
              <span>{field}</span>
              <Input
                value={value}
                maxLength={200}
                onChange={(e) => set(g.key, field, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <Button type="submit" disabled={busy}>
        {t('s06Public.cms.save')}
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </form>
  );
}
