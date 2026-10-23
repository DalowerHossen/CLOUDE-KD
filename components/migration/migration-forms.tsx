// path: components/migration/migration-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { MIGRATION_SOURCES, MIGRATION_TARGETS } from '@/config/s16-migration';
import { t, type StringKey } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

async function send(
  url: string,
  body: Record<string, unknown>,
): Promise<{ error: string | null; data: unknown }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `ui-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await response.json().catch(() => null)) as (Failure & { data?: unknown }) | null;
    if (response.ok) return { error: null, data: json?.data ?? null };
    if (json?.error?.code === 'step_up_required')
      return { error: t('s16Migration.common.needStepUp'), data: null };
    return { error: json?.error?.message ?? t('s16Migration.common.failed'), data: null };
  } catch {
    return { error: t('s16Migration.common.failed'), data: null };
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Uploads the file of another tool and opens the new job. */
export function UploadForm(): JSX.Element {
  const router = useRouter();
  const [source, setSource] = useState<(typeof MIGRATION_SOURCES)[number]>('generic');
  const [target, setTarget] = useState<(typeof MIGRATION_TARGETS)[number]>('clients');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await send('/api/migration/jobs', {
      source,
      target,
      fileName: file.name,
      dataBase64: toBase64(bytes),
    });
    if (result.error) setError(result.error);
    else {
      const id = (result.data as { id?: string } | null)?.id;
      router.push(id ? ['/migration', id].join('/') : '/migration');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mg-source">{t('s16Migration.upload.source')}</Label>
          <NativeSelect
            id="mg-source"
            value={source}
            onChange={(e) =>
              setSource(MIGRATION_SOURCES.find((s) => s === e.target.value) ?? 'generic')
            }
          >
            {MIGRATION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`s16Migration.sources.${s}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mg-target">{t('s16Migration.upload.target')}</Label>
          <NativeSelect
            id="mg-target"
            value={target}
            onChange={(e) =>
              setTarget(MIGRATION_TARGETS.find((x) => x === e.target.value) ?? 'clients')
            }
          >
            {MIGRATION_TARGETS.map((x) => (
              <option key={x} value={x}>
                {t(`s16Migration.targets.${x}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="mg-file">{t('s16Migration.upload.file')}</Label>
        <Input
          id="mg-file"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t('s16Migration.upload.help')}</p>
      <Button type="submit" disabled={busy || file === null}>
        {t('s16Migration.upload.send')}
      </Button>
    </form>
  );
}

interface FieldInfo {
  key: string;
  label: string;
  required: boolean;
}

/** The column mapping, the duplicate choice and the default country; sends the dry run. */
export function MappingForm({
  id,
  fields,
  headers,
  suggested,
  initialMapping,
  duplicateMode,
  askCountry,
}: {
  id: string;
  fields: FieldInfo[];
  headers: string[];
  suggested: Record<string, string>;
  initialMapping: Record<string, string>;
  duplicateMode: 'skip' | 'create';
  askCountry: boolean;
}): JSX.Element {
  const router = useRouter();
  const start = Object.keys(initialMapping).length > 0 ? initialMapping : suggested;
  const [mapping, setMapping] = useState<Record<string, string>>(start);
  const [mode, setMode] = useState(duplicateMode);
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await send(`/api/migration/jobs/${id}/validate`, {
      mapping,
      duplicateMode: mode,
      defaults:
        askCountry && country.trim() !== ''
          ? { billing_country: country.trim().toUpperCase() }
          : {},
    });
    if (result.error) setError(result.error);
    else router.refresh();
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <p className="text-sm text-muted-foreground">{t('s16Migration.job.mappingHelp')}</p>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`mg-f-${f.key}`}>
              {f.label}
              {f.required ? ` (${t('s16Migration.job.required')})` : ''}
            </Label>
            <NativeSelect
              id={`mg-f-${f.key}`}
              value={mapping[f.key] ?? ''}
              onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
            >
              <option value="">{t('s16Migration.job.noColumn')}</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mg-mode">{t('s16Migration.job.duplicates')}</Label>
          <NativeSelect
            id="mg-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value === 'create' ? 'create' : 'skip')}
          >
            <option value="skip">{t('s16Migration.job.skip')}</option>
            <option value="create">{t('s16Migration.job.create')}</option>
          </NativeSelect>
        </div>
        {askCountry ? (
          <div className="space-y-1">
            <Label htmlFor="mg-country">{t('s16Migration.job.defaultCountry')}</Label>
            <Input
              id="mg-country"
              value={country}
              maxLength={2}
              onChange={(e) => setCountry(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
      </div>
      <Button type="submit" disabled={busy}>
        {t('s16Migration.job.check')}
      </Button>
    </form>
  );
}

/** Start (after the owner confirms the count), cancel and roll back. */
export function JobButton({
  id,
  action,
  expected,
  label,
  variant = 'default',
}: {
  id: string;
  action: 'start' | 'cancel' | 'rollback';
  expected?: number;
  label: string;
  variant?: 'default' | 'destructive' | 'outline';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await send(
      `/api/migration/jobs/${id}/${action}`,
      action === 'start' ? { expectedCreate: expected ?? 0 } : {},
    );
    if (result.error) setError(result.error);
    else router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={busy || (action === 'start' && !expected)}
        onClick={() => void run()}
      >
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}
