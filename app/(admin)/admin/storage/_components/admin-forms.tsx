// path: app/(admin)/admin/storage/_components/admin-forms.tsx
'use client';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { useAdminAction } from '@/lib/security/use-admin-action';

const ENDPOINT = '/api/admin/storage/actions';
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function QuarantineButtons({ id }: { id: string }): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run({ action: 'review_quarantine', id, decision: 'dismissed' })}
        >
          {t('s05Storage.admin.dismiss')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run({ action: 'review_quarantine', id, decision: 'confirmed' })}
        >
          {t('s05Storage.admin.confirm')}
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function StartMigrationForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const ok = await run({
      action: 'start_migration',
      companyId: String(d.get('companyId') ?? '').trim(),
      target: String(d.get('target') ?? 'supabase'),
      deleteSource: d.get('deleteSource') === 'on',
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s05Storage.admin.startTitle')}
    >
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s05Storage.admin.company')}</span>
        <Input
          name="companyId"
          required
          pattern="[0-9a-fA-F-]{36}"
          maxLength={36}
          className="font-mono"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s05Storage.admin.target')}</span>
        <select name="target" defaultValue="supabase" className={selectClass}>
          <option value="supabase">{t('s05Storage.migration.toPlatformShort')}</option>
          <option value="google_drive">{t('s05Storage.migration.toDriveShort')}</option>
        </select>
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="deleteSource" />
        {t('s05Storage.migration.deleteSource')}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s05Storage.admin.start')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

export function MalwareHashForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const ok = await run({
      action: 'add_malware_hash',
      hash: String(d.get('hash') ?? '').trim(),
      label: String(d.get('label') ?? ''),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s05Storage.admin.hashTitle')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s05Storage.admin.hashValue')}</span>
        <Input
          name="hash"
          required
          pattern="[0-9a-fA-F]{64}"
          maxLength={64}
          className="font-mono"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s05Storage.admin.hashLabel')}</span>
        <Input name="label" required minLength={2} maxLength={120} />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s05Storage.admin.hashAdd')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}
