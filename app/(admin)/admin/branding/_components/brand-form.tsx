// path: app/(admin)/admin/branding/_components/brand-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { PlatformBrand } from '@/lib/brand/platform';
import { MediaPicker } from '../../cms/_components/media-picker';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function BrandForm({
  initial,
  canEdit,
}: {
  initial: PlatformBrand;
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<PlatformBrand>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/branding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (response.ok) {
        setMessage(t('s06Public.brandAdmin.saved'));
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s06Public.brandAdmin.error'));
      }
    } catch {
      setMessage(t('s06Public.brandAdmin.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-2xl space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit) void save();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>{t('s06Public.brandAdmin.name')}</span>
        <Input
          value={values.name}
          maxLength={60}
          disabled={!canEdit}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('s06Public.brandAdmin.tagline')}</span>
        <Input
          value={values.tagline}
          maxLength={200}
          disabled={!canEdit}
          onChange={(e) => setValues({ ...values, tagline: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('s06Public.brandAdmin.footerNote')}</span>
        <Input
          value={values.footerNote}
          maxLength={300}
          disabled={!canEdit}
          onChange={(e) => setValues({ ...values, footerNote: e.target.value })}
        />
      </label>
      <fieldset className="space-y-2 rounded-md border p-sp-12" disabled={!canEdit}>
        <legend className="px-1 text-sm font-medium">{t('s06Public.brandAdmin.logo')}</legend>
        <MediaPicker
          value={values.logoMediaId}
          onChange={(id) => setValues({ ...values, logoMediaId: id })}
        />
        {values.logoMediaId !== '' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setValues({ ...values, logoMediaId: '' })}
          >
            {t('s06Public.brandAdmin.removeLogo')}
          </Button>
        ) : null}
      </fieldset>
      {canEdit ? (
        <Button type="submit" disabled={busy}>
          {t('s06Public.cms.save')}
        </Button>
      ) : null}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </form>
  );
}
