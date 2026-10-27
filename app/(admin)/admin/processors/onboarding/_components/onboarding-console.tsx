// path: app/(admin)/admin/processors/onboarding/_components/onboarding-console.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  fieldValue,
  isEditable,
  type ApplicationStatus,
  type PackageDetail,
} from '@/lib/payment/onboarding/rules';
import {
  PackageForm,
  initialValues,
  toApplicationData,
  type FormValues,
  type RemoteApplication,
} from './package-form';

export interface ApplicationRow {
  id: string;
  companyName: string;
  externalId: string | null;
  packageId: string;
  status: ApplicationStatus;
  businessName: string;
  merchantId: string | null;
  gatewayId: string | null;
  pendingReason: string | null;
  rejectReason: string | null;
  version: number;
}

const BASE = '/api/admin/processors/onboarding';
const errorBody = z.object({ error: z.object({ message: z.string() }) });
const packageList = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
});
const field = z.object({
  id: z.string(),
  name: z.string(),
  required: z.boolean(),
  type: z.string(),
  choices: z.array(z.string()).nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  regex: z.string().nullable(),
  defaultValue: fieldValue,
});
const packageDetail = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    rules: z.array(z.string()),
    fields: z.array(field),
    collections: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        min: z.number(),
        max: z.number(),
        fields: z.array(field),
      }),
    ),
  }),
});
const entry = z.object({ id: z.string(), value: fieldValue });
const remoteBody = z.object({
  data: z.object({
    fields: z.array(entry),
    collections: z.array(
      z.object({
        id: z.string(),
        records: z.array(z.object({ id: z.string(), fields: z.array(entry) })),
      }),
    ),
  }),
});
const urlBody = z.object({ data: z.object({ url: z.string().url() }) });
const subscribed = z.object({ data: z.object({ callbackUrl: z.string() }) });

function toBase64(bytes: Uint8Array): string {
  let text = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    text += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(text);
}

async function failure(response: Response): Promise<string> {
  const parsed = errorBody.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : t('s10Processors.onboarding.failed');
}

interface Editor {
  mode: 'create' | 'edit';
  pkg: PackageDetail;
  values: FormValues;
  applicationId: string | null;
  version: number;
}

export function OnboardingConsole({
  applications,
  companies,
}: {
  applications: ApplicationRow[];
  companies: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [packages, setPackages] = useState<{ id: string; name: string }[] | null>(null);
  const [packageId, setPackageId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [documentFor, setDocumentFor] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);

  const say = (text: string, bad = false): void => setMessage({ text, bad });

  async function run(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch {
      say(t('s10Processors.onboarding.failed'), true);
    } finally {
      setBusy(false);
    }
  }

  async function startCreate(): Promise<void> {
    setCreating(true);
    setEditor(null);
    if (packages !== null) return;
    await run(async () => {
      const response = await fetch(`${BASE}/packages`);
      if (!response.ok) return say(await failure(response), true);
      const parsed = packageList.safeParse(await response.json().catch(() => null));
      setPackages(parsed.success ? parsed.data.data : []);
    });
  }

  async function loadPackage(id: string): Promise<PackageDetail | null> {
    const response = await fetch(`${BASE}/packages/${id}`);
    if (!response.ok) {
      say(await failure(response), true);
      return null;
    }
    const parsed = packageDetail.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      say(t('s10Processors.onboarding.failed'), true);
      return null;
    }
    return parsed.data.data;
  }

  async function loadForm(): Promise<void> {
    await run(async () => {
      const pkg = await loadPackage(packageId);
      if (pkg)
        setEditor({
          mode: 'create',
          pkg,
          values: initialValues(pkg, null),
          applicationId: null,
          version: 0,
        });
    });
  }

  async function openEdit(row: ApplicationRow): Promise<void> {
    setCreating(false);
    await run(async () => {
      const pkg = await loadPackage(row.packageId);
      if (!pkg) return;
      const response = await fetch(`${BASE}/${row.id}`);
      if (!response.ok) return say(await failure(response), true);
      const parsed = remoteBody.safeParse(await response.json().catch(() => null));
      const remote: RemoteApplication | null = parsed.success ? parsed.data.data : null;
      setEditor({
        mode: 'edit',
        pkg,
        values: initialValues(pkg, remote),
        applicationId: row.id,
        version: row.version,
      });
    });
  }

  async function save(): Promise<void> {
    if (!editor) return;
    await run(async () => {
      const data = toApplicationData(editor.pkg, editor.values);
      const response =
        editor.mode === 'create'
          ? await fetch(BASE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ companyId, packageId: editor.pkg.id, data }),
            })
          : await fetch(`${BASE}/${editor.applicationId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ data, expectedVersion: editor.version }),
            });
      if (!response.ok) return say(await failure(response), true);
      say(
        editor.mode === 'create'
          ? t('s10Processors.onboarding.created')
          : t('s10Processors.onboarding.updated'),
      );
      setEditor(null);
      setCreating(false);
      router.refresh();
    });
  }

  async function post(path: string, ok: string, body?: unknown): Promise<void> {
    await run(async () => {
      const response = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) return say(await failure(response), true);
      say(ok);
      router.refresh();
    });
  }

  async function openConsent(id: string): Promise<void> {
    await run(async () => {
      const response = await fetch(`${BASE}/${id}/consent`);
      if (!response.ok) return say(await failure(response), true);
      const parsed = urlBody.safeParse(await response.json().catch(() => null));
      if (!parsed.success) return say(t('s10Processors.onboarding.failed'), true);
      window.open(parsed.data.data.url, '_blank', 'noopener,noreferrer');
      say(t('s10Processors.onboarding.consentOpened'));
    });
  }

  async function subscribe(): Promise<void> {
    await run(async () => {
      const response = await fetch(`${BASE}/subscription`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) return say(await failure(response), true);
      const parsed = subscribed.safeParse(await response.json().catch(() => null));
      say(
        t('s10Processors.onboarding.subscribed', {
          url: parsed.success ? parsed.data.data.callbackUrl : '',
        }),
      );
    });
  }

  async function sendDocument(id: string, file: File): Promise<void> {
    if (file.size > DOCUMENT_MAX_BYTES) return say(t('s10Processors.onboarding.fileTooBig'), true);
    await run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch(`${BASE}/${id}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          fileName: file.name,
          mimeType: file.type,
          dataBase64: toBase64(bytes),
        }),
      });
      if (!response.ok) return say(await failure(response), true);
      say(t('s10Processors.onboarding.documentSent'));
      setDocumentFor(null);
    });
  }

  return (
    <div className="space-y-sp-16">
      <section className="space-y-2 rounded-md border p-sp-12 text-sm">
        <h2 className="font-medium">{t('s10Processors.onboarding.setupTitle')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>{t('s10Processors.onboarding.setupSteps.one')}</li>
          <li>{t('s10Processors.onboarding.setupSteps.two')}</li>
          <li>{t('s10Processors.onboarding.setupSteps.three')}</li>
          <li>{t('s10Processors.onboarding.setupSteps.four')}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void subscribe()}>
            {t('s10Processors.onboarding.subscribe')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void startCreate()}>
            {t('s10Processors.onboarding.newApplication')}
          </Button>
        </div>
      </section>

      {message ? (
        <Alert variant={message.bad ? 'destructive' : 'default'} aria-live="polite">
          {message.text}
        </Alert>
      ) : null}

      {creating && !editor ? (
        <section className="grid gap-sp-12 rounded-md border p-sp-12 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>{t('s10Processors.onboarding.company')}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">{t('s10Processors.onboarding.chooseCompany')}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s10Processors.onboarding.package')}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              <option value="">{t('s10Processors.onboarding.choosePackage')}</option>
              {(packages ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              type="button"
              disabled={busy || companyId === '' || packageId === ''}
              onClick={() => void loadForm()}
            >
              {t('s10Processors.onboarding.loadForm')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              {t('s10Processors.onboarding.cancel')}
            </Button>
          </div>
        </section>
      ) : null}

      {editor ? (
        <section className="space-y-sp-12 rounded-md border p-sp-12">
          <h2 className="font-medium">{editor.pkg.name}</h2>
          <PackageForm
            pkg={editor.pkg}
            values={editor.values}
            disabled={busy}
            onChange={(values) => setEditor({ ...editor, values })}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {editor.mode === 'create'
                ? t('s10Processors.onboarding.createDraft')
                : t('s10Processors.onboarding.saveDraft')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditor(null);
                setCreating(false);
              }}
            >
              {t('s10Processors.onboarding.cancel')}
            </Button>
          </div>
        </section>
      ) : null}

      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s10Processors.onboarding.empty')}</p>
      ) : (
        <ul className="space-y-sp-12">
          {applications.map((a) => (
            <li key={a.id} className="space-y-2 rounded-md border p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {a.companyName}
                    {a.businessName !== '' ? ` - ${a.businessName}` : ''}
                  </p>
                  <p className="text-muted-foreground">
                    {t('s10Processors.onboarding.ids', {
                      app: a.externalId ?? '-',
                      mid: a.merchantId ?? '-',
                      gateway: a.gatewayId ?? '-',
                    })}
                  </p>
                  {a.pendingReason || a.rejectReason ? (
                    <p className="text-muted-foreground">
                      {t('s10Processors.onboarding.reason', {
                        reason: a.pendingReason ?? a.rejectReason ?? '',
                      })}
                    </p>
                  ) : null}
                </div>
                <Badge variant="outline">
                  {t(`s10Processors.onboarding.statuses.${a.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {isEditable(a.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void openEdit(a)}
                  >
                    {t('s10Processors.onboarding.actions.edit')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || a.externalId === null}
                  onClick={() =>
                    void post(`${a.id}/refresh`, t('s10Processors.onboarding.refreshed'))
                  }
                >
                  {t('s10Processors.onboarding.actions.refresh')}
                </Button>
                {isEditable(a.status) ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void openConsent(a.id)}
                    >
                      {t('s10Processors.onboarding.actions.consent')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void post(`${a.id}/submit`, t('s10Processors.onboarding.submitted'))
                      }
                    >
                      {t('s10Processors.onboarding.actions.submit')}
                    </Button>
                  </>
                ) : null}
                {a.status === 'draft' || a.status === 'underwriter_requested_information' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDocumentFor(a.id)}
                  >
                    {t('s10Processors.onboarding.actions.document')}
                  </Button>
                ) : null}
                {a.status === 'underwriter_requested_information' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setNoteFor(a.id)}
                  >
                    {t('s10Processors.onboarding.actions.note')}
                  </Button>
                ) : null}
              </div>
              {documentFor === a.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1">
                    <span>{t('s10Processors.onboarding.documentType')}</span>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-2"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                    >
                      {DOCUMENT_TYPES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void sendDocument(a.id, file);
                      e.target.value = '';
                    }}
                  />
                </div>
              ) : null}
              {noteFor === a.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[16rem] flex-1 space-y-1">
                    <span>{t('s10Processors.onboarding.noteLabel')}</span>
                    <Input
                      value={note}
                      maxLength={10000}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={busy || note.trim() === ''}
                    onClick={() => {
                      void post(`${a.id}/note`, t('s10Processors.onboarding.noteSent'), {
                        note,
                      }).then(() => {
                        setNote('');
                        setNoteFor(null);
                      });
                    }}
                  >
                    {t('s10Processors.onboarding.send')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
