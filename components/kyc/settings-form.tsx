// path: components/kyc/settings-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import {
  BUSINESS_FIELDS,
  KYC_DOC_CATALOG,
  type KycDocType,
  type KycMode,
  type KycPresentation,
  type KycProfile,
  type KycProvider,
} from '@/lib/kyc/profile';

type DocChoice = 'required' | 'optional' | 'off';
interface Failure {
  error?: { code?: string; message?: string; correlation_id?: string };
}

const choiceOf = (p: KycProfile, d: KycDocType): DocChoice =>
  p.requiredDocuments.includes(d)
    ? 'required'
    : p.optionalDocuments.includes(d)
      ? 'optional'
      : 'off';

/** The super admin's choices: manual or automatic verification, the documents and the questions of the form. */
export function KycSettingsForm({
  profile,
  canManage,
}: {
  profile: KycProfile;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<KycMode>(profile.mode);
  const [provider, setProvider] = useState<KycProvider>(profile.provider);
  const presentation: KycPresentation = profile.presentation;
  const [docs, setDocs] = useState<Record<KycDocType, DocChoice>>(
    () =>
      Object.fromEntries(KYC_DOC_CATALOG.map((d) => [d, choiceOf(profile, d)])) as Record<
        KycDocType,
        DocChoice
      >,
  );
  const [asked, setAsked] = useState<string[]>(profile.businessFields);
  const [keys, setKeys] = useState({
    appToken: '',
    secretKey: '',
    levelName: '',
    webhookSecret: '',
  });
  const [version, setVersion] = useState(profile.version);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/kyc/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          mode,
          provider,
          presentation,
          requiredDocuments: KYC_DOC_CATALOG.filter((d) => docs[d] === 'required'),
          optionalDocuments: KYC_DOC_CATALOG.filter((d) => docs[d] === 'optional'),
          businessFields: asked,
          providerKeys: keys,
          version,
        }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as
        (Failure & { data?: KycProfile }) | null;
      if (!response.ok) {
        setNotice({
          ok: false,
          text:
            json?.error?.code === 'step_up_required'
              ? t('s07Company.kycSettings.needStepUp')
              : json?.error?.message
                ? `${json.error.message}${json.error.correlation_id ? ` (${json.error.correlation_id})` : ''}`
                : t('s07Company.kycSettings.failed'),
        });
      } else {
        setVersion(json?.data?.version ?? version + 1);
        setKeys({ appToken: '', secretKey: '', levelName: '', webhookSecret: '' });
        setNotice({ ok: true, text: t('s07Company.kycSettings.saved') });
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s07Company.kycSettings.failed') });
    }
    setBusy(false);
  }

  const toggleAsked = (id: string): void =>
    setAsked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  return (
    <form onSubmit={save} className="space-y-sp-16" aria-label={t('s07Company.kycSettings.title')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('s07Company.kycSettings.modeTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <div className="space-y-sp-4">
            <Label htmlFor="ks-mode">{t('s07Company.kycSettings.mode')}</Label>
            <NativeSelect
              id="ks-mode"
              value={mode}
              disabled={!canManage}
              onChange={(e) => setMode(e.target.value === 'automatic' ? 'automatic' : 'manual')}
            >
              <option value="manual">{t('s07Company.kycSettings.modes.manual')}</option>
              <option value="automatic">{t('s07Company.kycSettings.modes.automatic')}</option>
            </NativeSelect>
            <p className="text-sm text-muted-foreground">
              {t(`s07Company.kycSettings.modeHelp.${mode}`)}
            </p>
          </div>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <div className="space-y-sp-4">
              <Label htmlFor="ks-provider">{t('s07Company.kycSettings.provider')}</Label>
              <NativeSelect
                id="ks-provider"
                value={provider}
                disabled={!canManage}
                onChange={(e) => setProvider(e.target.value === 'sumsub' ? 'sumsub' : 'none')}
              >
                <option value="none">{t('s07Company.kycSettings.providers.none')}</option>
                <option value="sumsub">{t('s07Company.kycSettings.providers.sumsub')}</option>
              </NativeSelect>
            </div>
          </div>
        </CardContent>
      </Card>

      {provider === 'sumsub' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s07Company.kycSettings.keysTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            <p className="text-sm text-muted-foreground">
              {profile.providerConfigured
                ? t('s07Company.kycSettings.keysSaved')
                : t('s07Company.kycSettings.keysNone')}
            </p>
            <div className="grid gap-sp-12 sm:grid-cols-2">
              {(
                [
                  ['appToken', 'keyAppToken'],
                  ['secretKey', 'keySecret'],
                  ['levelName', 'keyLevel'],
                  ['webhookSecret', 'keyWebhook'],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-sp-4">
                  <Label htmlFor={`ks-${field}`}>{t(`s07Company.kycSettings.${label}`)}</Label>
                  <Input
                    id={`ks-${field}`}
                    type={field === 'levelName' ? 'text' : 'password'}
                    autoComplete="off"
                    value={keys[field]}
                    maxLength={200}
                    disabled={!canManage}
                    onChange={(e) => setKeys((k) => ({ ...k, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t('s07Company.kycSettings.keysHelp')}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('s07Company.kycSettings.docsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-8">
          <p className="text-sm text-muted-foreground">{t('s07Company.kycSettings.docsHelp')}</p>
          {KYC_DOC_CATALOG.map((d) => (
            <div key={d} className="flex items-center justify-between gap-sp-12">
              <Label htmlFor={`ks-doc-${d}`}>{t(`s07Company.kyc.docs.${d}`)}</Label>
              <NativeSelect
                id={`ks-doc-${d}`}
                className="w-40"
                value={docs[d]}
                disabled={!canManage}
                onChange={(e) => {
                  const v = e.target.value;
                  setDocs((now) => ({
                    ...now,
                    [d]: v === 'required' ? 'required' : v === 'optional' ? 'optional' : 'off',
                  }));
                }}
              >
                <option value="required">{t('s07Company.kycSettings.docChoice.required')}</option>
                <option value="optional">{t('s07Company.kycSettings.docChoice.optional')}</option>
                <option value="off">{t('s07Company.kycSettings.docChoice.off')}</option>
              </NativeSelect>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('s07Company.kycSettings.questionsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-8">
          <p className="text-sm text-muted-foreground">
            {t('s07Company.kycSettings.questionsHelp')}
          </p>
          <div className="grid gap-sp-8 sm:grid-cols-2">
            {BUSINESS_FIELDS.map((f) => (
              <label key={f.id} className="flex items-center gap-sp-8 text-sm">
                <input
                  type="checkbox"
                  checked={asked.includes(f.id)}
                  disabled={!canManage}
                  onChange={() => toggleAsked(f.id)}
                />
                {t(`s07Company.kyc.fields.${f.id}` as StringKey)}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {notice ? <Alert variant={notice.ok ? 'default' : 'destructive'}>{notice.text}</Alert> : null}
      {canManage ? (
        <Button type="submit" disabled={busy}>
          {busy ? t('s07Company.kycSettings.saving') : t('s07Company.kycSettings.save')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('s07Company.kycSettings.readOnly')}</p>
      )}
    </form>
  );
}
