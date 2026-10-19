// path: app/(dashboard)/wallet/_components/json-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';

export interface FormFieldSpec {
  name: string;
  label: string;
  kind?: 'text' | 'select' | 'checkbox';
  options?: readonly { value: string; label: string }[];
  initial?: string;
  hint?: string;
  required?: boolean;
  /** Sent as a number (whole) instead of text. Empty is left out (or sent as null with `emptyAsNull`). */
  whole?: boolean;
}

interface JsonFormProps {
  endpoint: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  fields: readonly FormFieldSpec[];
  submitLabel: string;
  doneText: string;
  /** Adds an Idempotency-Key header (one new key for every submit). */
  idempotent?: boolean;
  /** Empty text fields are sent as null (to clear a saved value). */
  emptyAsNull?: boolean;
  fixed?: Record<string, unknown>;
  /** Puts all fields under this key of the body (for routes that take several groups of settings). */
  nest?: string;
  /** The value of this field replaces `__company__` in the endpoint and is left out of the body. */
  pathField?: string;
  resetAfter?: boolean;
}

function newKey(): string {
  return `ui-${crypto.randomUUID()}`;
}

/** A small form that sends one JSON request to an API route, shows the answer and refreshes the page. */
export function JsonForm(props: JsonFormProps): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      props.fields.map((f) => [f.name, f.initial ?? (f.kind === 'checkbox' ? 'false' : '')]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const body: Record<string, unknown> = { ...(props.fixed ?? {}) };
    for (const f of props.fields) {
      const raw = (values[f.name] ?? '').trim();
      if (f.kind === 'checkbox') body[f.name] = raw === 'true';
      else if (raw === '') {
        if (props.emptyAsNull) body[f.name] = null;
      } else body[f.name] = f.whole ? toInt(raw, 0) : raw;
    }
    let endpoint = props.endpoint;
    if (props.pathField) {
      endpoint = endpoint.replace(
        '__company__',
        encodeURIComponent(String(body[props.pathField] ?? '')),
      );
      delete body[props.pathField];
    }
    const payload = props.nest ? { [props.nest]: body } : body;
    try {
      const response = await fetch(endpoint, {
        method: props.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          ...(props.idempotent ? { 'idempotency-key': newKey() } : {}),
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s14Wallet.common.failed'));
      setNotice({ ok: true, text: props.doneText });
      if (props.resetAfter)
        setValues(Object.fromEntries(props.fields.map((f) => [f.name, f.initial ?? ''])));
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
        {props.fields.map((f) => {
          const id = `${props.endpoint}-${f.name}`.replace(/[^a-zA-Z0-9-]/g, '-');
          return (
            <div key={f.name} className="space-y-1">
              {f.kind === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={values[f.name] === 'true'}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.checked ? 'true' : 'false' })
                    }
                  />
                  {f.label}
                </label>
              ) : (
                <>
                  <Label htmlFor={id}>{f.label}</Label>
                  {f.kind === 'select' ? (
                    <NativeSelect
                      id={id}
                      value={values[f.name]}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={id}
                      value={values[f.name]}
                      required={f.required}
                      autoComplete="off"
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                  {f.hint ? <p className="text-sm text-muted-foreground">{f.hint}</p> : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? t('s14Wallet.common.working') : props.submitLabel}
      </Button>
    </form>
  );
}
