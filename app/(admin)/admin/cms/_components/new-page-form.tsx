// path: app/(admin)/admin/cms/_components/new-page-form.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

const SLUG = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;

export function NewPageForm(): JSX.Element {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  function go(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (SLUG.test(slug)) router.push(`/admin/cms/${slug}`);
  }
  return (
    <form
      onSubmit={go}
      className="flex flex-wrap items-end gap-2"
      aria-label={t('s06Public.cms.newPage')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s06Public.cms.newSlug')}</span>
        <Input
          value={slug}
          maxLength={62}
          pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]|[a-z0-9]"
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
        />
      </label>
      <Button type="submit" disabled={!SLUG.test(slug)}>
        {t('s06Public.cms.create')}
      </Button>
    </form>
  );
}
