// path: components/social/social-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SOCIAL_PROVIDERS } from '@/config/s16-social';
import { t, type StringKey } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';
import { charCount, countHashtags, countMentions, problemsFor } from '@/lib/social/rules';

interface Failure {
  error?: { code?: string; message?: string };
}

async function failure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Social.common.needStepUp');
  return json?.error?.message ?? t('s16Social.common.failed');
}

const key = (): string => `ui-${crypto.randomUUID()}`;

/** Connects an account. The token is sent once and is not shown again. */
export function ConnectAccountForm(): JSX.Element {
  const router = useRouter();
  const [provider, setProvider] = useState<(typeof SOCIAL_PROVIDERS)[number]>('sandbox');
  const [displayName, setDisplayName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [token, setToken] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const sandbox = provider === 'sandbox';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/social/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          displayName,
          externalId: sandbox && externalId.trim() === '' ? `sandbox-${Date.now()}` : externalId,
          ...(sandbox
            ? {}
            : {
                accessToken: token,
                tokenExpiresInDays: days.trim() === '' ? null : toInt(days, 0),
              }),
        }),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        setNotice({ ok: true, text: t('s16Social.common.done') });
        setToken('');
        setDisplayName('');
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Social.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sa-provider">{t('s16Social.accounts.provider')}</Label>
          <NativeSelect
            id="sa-provider"
            value={provider}
            onChange={(e) =>
              setProvider(SOCIAL_PROVIDERS.find((p) => p === e.target.value) ?? 'sandbox')
            }
          >
            {SOCIAL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`s16Social.providers.${p}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sa-name">{t('s16Social.accounts.name')}</Label>
          <Input
            id="sa-name"
            value={displayName}
            maxLength={120}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
          />
        </div>
        {!sandbox ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="sa-id">{t('s16Social.accounts.externalId')}</Label>
              <Input
                id="sa-id"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sa-token">{t('s16Social.accounts.token')}</Label>
              <Input
                id="sa-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sa-days">{t('s16Social.accounts.expires')}</Label>
              <Input
                id="sa-days"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{t('s16Social.accounts.help')}</p>
      <Button
        type="submit"
        disabled={
          busy ||
          displayName.trim() === '' ||
          (!sandbox && (externalId.trim() === '' || token.trim() === ''))
        }
      >
        {t('s16Social.accounts.connect')}
      </Button>
    </form>
  );
}

export interface AccountChoice {
  id: string;
  label: string;
  provider: (typeof SOCIAL_PROVIDERS)[number];
}

/** Writes a post. The counts and the problems of the chosen network are shown while typing. */
export function ComposeForm({
  accounts,
  groups,
}: {
  accounts: AccountChoice[];
  groups: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [groupId, setGroupId] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const account = accounts.find((a) => a.id === accountId);
  const problems = account
    ? problemsFor(account.provider, {
        body,
        linkUrl: linkUrl.trim() === '' ? null : linkUrl.trim(),
        imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
      })
    : [];

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          accountId,
          body,
          imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
          linkUrl: linkUrl.trim() === '' ? null : linkUrl.trim(),
          hashtagGroupId: groupId === '' ? null : groupId,
          scheduledAt: when === '' ? null : new Date(when).toISOString(),
        }),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        setNotice({ ok: true, text: t('s16Social.common.done') });
        setBody('');
        setImageUrl('');
        setLinkUrl('');
        setWhen('');
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Social.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="sp-account">{t('s16Social.posts.account')}</Label>
        <NativeSelect
          id="sp-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">{t('s16Social.posts.choose')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-body">{t('s16Social.posts.body')}</Label>
        <Textarea
          id="sp-body"
          rows={5}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {charCount(body)} {t('s16Social.posts.count')}, {countHashtags(body)}{' '}
          {t('s16Social.posts.hashtags')}, {countMentions(body)} {t('s16Social.posts.mentions')}
        </p>
      </div>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sp-image">{t('s16Social.posts.image')}</Label>
          <Input
            id="sp-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-link">{t('s16Social.posts.link')}</Label>
          <Input
            id="sp-link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-group">{t('s16Social.posts.hashtagGroup')}</Label>
          <NativeSelect id="sp-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('s16Social.posts.none')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-when">{t('s16Social.posts.when')}</Label>
          <Input
            id="sp-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
      </div>
      {problems.length > 0 ? (
        <Alert variant="destructive">
          <p className="font-medium">{t('s16Social.posts.problemsTitle')}</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <Button
        type="submit"
        disabled={busy || accountId === '' || (body.trim() === '' && imageUrl.trim() === '')}
      >
        {t('s16Social.posts.saveDraft')}
      </Button>
    </form>
  );
}

/** One action on a post. */
export function PostActionButton({
  id,
  action,
  label,
  variant = 'outline',
}: {
  id: string;
  action: 'publish' | 'cancel' | 'submit';
  label: string;
  variant?: 'outline' | 'destructive';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/social/posts/${id}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(action === 'publish' || action === 'submit' ? { 'idempotency-key': key() } : {}),
        },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) setError(await failure(response));
      else router.refresh();
    } catch {
      setError(t('s16Social.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant={variant} disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}

/** Pauses or resumes an account, or checks its connection. */
export function AccountButton({
  id,
  version,
  mode,
  label,
}: {
  id: string;
  version: number;
  mode: 'check' | 'pause' | 'resume';
  label: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response =
        mode === 'check'
          ? await fetch(`/api/social/accounts/${id}/check`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
              cache: 'no-store',
            })
          : await fetch(`/api/social/accounts/${id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ version, status: mode === 'pause' ? 'paused' : 'active' }),
              cache: 'no-store',
            });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        if (mode === 'check') {
          const json = (await response.json()) as { data: { ok: boolean; message: string } };
          setNotice({ ok: json.data.ok, text: json.data.message });
        }
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Social.common.failed') });
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
    </span>
  );
}
