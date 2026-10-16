// path: components/settings/section-form.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { FORMS, type EditableSection, type FieldSpec } from '@/lib/company/forms';
import { t, type StringKey } from '@/lib/i18n';

const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});
const savedBody = z.object({ data: z.object({ version: z.number() }) });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
interface Contact {
  name: string;
  role: string;
  email: string;
  phone: string;
}

const label = (name: string): string => t(`s07Company.settings.fields.${name}` as StringKey);
const choice = (name: string, value: string): string => {
  const key = `s07Company.settings.choices.${name}.${value}` as StringKey;
  const text = t(key);
  return text === key ? value : text;
};

function get(value: Obj, spec: FieldSpec): Json {
  let node: Json = value;
  for (const part of spec.path ?? []) node = (node as Obj)[part] ?? {};
  return (node as Obj)[spec.name] ?? '';
}
function put(value: Obj, spec: FieldSpec, next: Json): Obj {
  if (!spec.path || spec.path.length === 0) return { ...value, [spec.name]: next };
  const [head, ...rest] = spec.path;
  const child = (value[head as string] ?? {}) as Obj;
  return { ...value, [head as string]: put(child, { ...spec, path: rest }, next) };
}

/** Generic settings form for one section: renders the field list, saves with the version, shows conflicts. */
export function SectionForm({
  section,
  initial,
  version: initialVersion,
  disabled = false,
  lockedFields = [],
  extra,
}: {
  section: EditableSection;
  initial: Obj;
  version: number;
  disabled?: boolean;
  /** Field names shown but not changeable (for example a plan feature the company does not have). */
  lockedFields?: readonly string[];
  extra?: React.ReactNode;
}): JSX.Element {
  const [value, setValue] = useState<Obj>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const specs = FORMS[section] ?? [];

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/company/${section}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value, expectedVersion: version }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = savedBody.safeParse(json);
        if (parsed.success) setVersion(parsed.data.data.version);
        setMessage({ ok: true, text: t('s07Company.settings.saved') });
      } else {
        const err = errorBody.safeParse(json);
        setMessage({
          ok: false,
          text:
            err.success && err.data.error.code === 'conflict'
              ? t('s07Company.settings.conflict')
              : err.success
                ? err.data.error.message
                : t('s07Company.settings.error'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s07Company.settings.error') });
    } finally {
      setBusy(false);
    }
  }

  const cls = 'block space-y-1 text-sm';
  return (
    <form
      className="space-y-sp-12"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={disabled || busy} className="space-y-sp-12">
        {specs.map((spec) => {
          const current = get(value, spec);
          const locked = lockedFields.includes(spec.name);
          const set = (next: Json): void => setValue(put(value, spec, next));
          if (spec.kind === 'contacts') {
            const list = (Array.isArray(current) ? current : []) as unknown as Contact[];
            return (
              <fieldset key={spec.name} className="space-y-sp-12 rounded-md border p-sp-12">
                <legend className="px-1 text-sm font-medium">{label(spec.label)}</legend>
                {list.map((c, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-2">
                    {(['name', 'role', 'email', 'phone'] as const).map((f) => (
                      <label key={f} className={cls}>
                        <span>{label(`contact_${f}`)}</span>
                        <Input
                          value={c[f]}
                          maxLength={f === 'email' ? 254 : 100}
                          onChange={(e) =>
                            set(
                              list.map((x, j) =>
                                j === i ? { ...x, [f]: e.target.value } : x,
                              ) as unknown as Json,
                            )
                          }
                        />
                      </label>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set(list.filter((_, j) => j !== i) as unknown as Json)}
                    >
                      {t('s07Company.settings.remove')}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={list.length >= 5}
                  onClick={() =>
                    set([...list, { name: '', role: '', email: '', phone: '' }] as unknown as Json)
                  }
                >
                  {t('s07Company.settings.addContact')}
                </Button>
              </fieldset>
            );
          }
          if (spec.kind === 'multi') {
            const chosen = (Array.isArray(current) ? current : []) as string[];
            return (
              <fieldset key={spec.name} className="space-y-1 text-sm" disabled={locked}>
                <legend>{label(spec.label)}</legend>
                <div className="flex flex-wrap gap-sp-12">
                  {(spec.options ?? []).map((o) => (
                    <label key={o.value} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={chosen.includes(o.value)}
                        onChange={(e) =>
                          set(
                            e.target.checked
                              ? [...chosen, o.value].slice(0, 5)
                              : chosen.filter((x) => x !== o.value),
                          )
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
                {locked ? (
                  <p className="text-caption text-muted-foreground">
                    {t('s07Company.settings.planLocked')}
                  </p>
                ) : null}
              </fieldset>
            );
          }
          if (spec.kind === 'select')
            return (
              <label key={spec.name} className={cls}>
                <span>{label(spec.label)}</span>
                <NativeSelect
                  value={String(current)}
                  disabled={locked}
                  onChange={(e) => set(spec.numeric ? Number(e.target.value) : e.target.value)}
                >
                  {(spec.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {spec.name === 'country' ? o.label : choice(spec.name, o.value)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            );
          if (spec.kind === 'textarea')
            return (
              <label key={spec.name} className={cls}>
                <span>{label(spec.label)}</span>
                <Textarea
                  rows={3}
                  maxLength={spec.max}
                  value={String(current)}
                  onChange={(e) => set(e.target.value)}
                />
              </label>
            );
          return (
            <label key={spec.name} className={cls}>
              <span>{label(spec.label)}</span>
              <Input
                type={
                  spec.kind === 'color' ? 'color' : spec.kind === 'number' ? 'number' : spec.kind
                }
                className={spec.kind === 'color' ? 'h-11 p-1' : undefined}
                maxLength={spec.max}
                value={String(current)}
                onChange={(e) =>
                  set(
                    spec.kind === 'number'
                      ? Number(e.target.value)
                      : spec.upper
                        ? e.target.value.toUpperCase()
                        : e.target.value,
                  )
                }
              />
            </label>
          );
        })}
        {extra}
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={disabled || busy}>
          {busy ? t('s07Company.settings.saving') : t('s07Company.settings.save')}
        </Button>
        <p
          aria-live="polite"
          role="status"
          className={`text-sm ${message && !message.ok ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {message?.text}
        </p>
      </div>
    </form>
  );
}
