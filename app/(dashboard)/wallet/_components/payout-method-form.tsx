// path: app/(dashboard)/wallet/_components/payout-method-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { COUNTRIES } from '@/config/countries';
import { t, type StringKey } from '@/lib/i18n';
import {
  ACCOUNT_TYPES,
  PAYOUT_KIND_RULES,
  kindsForCountry,
  type PayoutFieldName,
  type PayoutKind,
} from '@/lib/payout/method-kinds';

interface Props {
  /** The country of the company, when it is known; the owner can still pick another. */
  defaultCountry: string;
}

/** Add a payout method: pick a country, then a way to be paid; the form then asks only for what that way needs. */
export function PayoutMethodForm({ defaultCountry }: Props): JSX.Element {
  const router = useRouter();
  const [country, setCountry] = useState(defaultCountry);
  const [kind, setKind] = useState<PayoutKind | ''>('');
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [values, setValues] = useState<Partial<Record<PayoutFieldName, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const kinds = useMemo(() => (country === '' ? [] : kindsForCountry(country)), [country]);
  const rule = kind === '' ? null : PAYOUT_KIND_RULES[kind];
  const activeKind = kind !== '' && kinds.includes(kind) ? kind : '';

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (activeKind === '') return;
    setBusy(true);
    setNotice(null);
    const body: Record<string, unknown> = { kind: activeKind, label, country, currency };
    for (const f of PAYOUT_KIND_RULES[activeKind].fields) {
      const raw = (values[f.name] ?? '').trim();
      if (raw !== '') body[f.name] = raw;
    }
    try {
      const response = await fetch('/api/payouts/methods', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s14Wallet.common.failed'));
      setNotice({ ok: true, text: t('s14Wallet.methods.added') });
      setLabel('');
      setValues({});
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s14Wallet.common.failed'),
      });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pm-country">{t('s14Wallet.methods.pickCountry')}</Label>
          <NativeSelect
            id="pm-country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setKind('');
            }}
          >
            <option value="">{t('s14Wallet.methods.pickCountryPrompt')}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pm-kind">{t('s14Wallet.methods.pickKind')}</Label>
          <NativeSelect
            id="pm-kind"
            value={activeKind}
            disabled={country === ''}
            onChange={(e) => setKind(e.target.value as PayoutKind | '')}
          >
            <option value="" />
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`s14Wallet.methods.kinds.${k}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {rule && activeKind !== '' ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="pm-label">{t('s14Wallet.methods.label')}</Label>
              <Input
                id="pm-label"
                value={label}
                required
                autoComplete="off"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-currency">{t('s14Wallet.methods.currency')}</Label>
              <Input
                id="pm-currency"
                value={currency}
                autoComplete="off"
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
            {rule.fields.map((f) => {
              const id = `pm-${f.name}`;
              return (
                <div key={f.name} className="space-y-1">
                  <Label htmlFor={id}>
                    {t(`s14Wallet.methods.wording.${f.wording}` as StringKey)}
                  </Label>
                  {f.name === 'accountType' ? (
                    <NativeSelect
                      id={id}
                      value={values.accountType ?? ''}
                      onChange={(e) => setValues({ ...values, accountType: e.target.value })}
                    >
                      <option value="" />
                      {ACCOUNT_TYPES.map((a) => (
                        <option key={a} value={a}>
                          {t(`s14Wallet.methods.accountTypes.${a}` as StringKey)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={id}
                      value={values[f.name] ?? ''}
                      required={f.required}
                      autoComplete="off"
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
      <Button type="submit" disabled={busy || activeKind === ''}>
        {busy ? t('s14Wallet.common.working') : t('s14Wallet.methods.add')}
      </Button>
    </form>
  );
}
