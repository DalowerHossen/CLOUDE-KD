// path: app/(admin)/admin/processors/onboarding/_components/package-form.tsx
'use client';
// The application form generated from the package NMI defines (docs/processors/nmi.md section 13): one input per field by
// its type, and repeatable groups for the collections. Values are kept as text and turned into the API's values on save.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import {
  valueFromInput,
  type ApplicationData,
  type FieldValue,
  type PackageDetail,
  type PackageField,
} from '@/lib/payment/onboarding/rules';

export type Entry = string | string[];
export interface RecordValues {
  id: string;
  fields: Record<string, Entry>;
}
export interface FormValues {
  fields: Record<string, Entry>;
  collections: Record<string, RecordValues[]>;
}

const SECRET_TYPES: ReadonlySet<string> = new Set([
  'ssn',
  'federal_tax_id',
  'account_number',
  'routing_number',
]);

function entryOf(field: PackageField, value: FieldValue | undefined): Entry {
  const v = value === undefined ? field.defaultValue : value;
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return field.type === 'multiselect' ? [] : '';
  return String(v);
}

function newRecordId(): string {
  return globalThis.crypto.randomUUID();
}

export interface RemoteApplication {
  fields: { id: string; value: FieldValue }[];
  collections: {
    id: string;
    records: { id: string; fields: { id: string; value: FieldValue }[] }[];
  }[];
}

/** Values for the form: what NMI holds for the application when there is one, else each field's default. */
export function initialValues(pkg: PackageDetail, remote: RemoteApplication | null): FormValues {
  const known = new Map((remote?.fields ?? []).map((f) => [f.id, f.value]));
  const fields: Record<string, Entry> = {};
  for (const f of pkg.fields)
    fields[f.id] = entryOf(f, remote ? (known.get(f.id) ?? null) : undefined);
  const collections: Record<string, RecordValues[]> = {};
  for (const c of pkg.collections) {
    const held = remote?.collections.find((x) => x.id === c.id)?.records ?? [];
    const make = (
      rec: { id: string; fields: { id: string; value: FieldValue }[] } | null,
    ): RecordValues => {
      const byId = new Map((rec?.fields ?? []).map((f) => [f.id, f.value]));
      const values: Record<string, Entry> = {};
      for (const f of c.fields)
        values[f.id] = entryOf(f, rec ? (byId.get(f.id) ?? null) : undefined);
      return { id: rec?.id ?? newRecordId(), fields: values };
    };
    const rows = held.map((r) => make(r));
    while (rows.length < c.min) rows.push(make(null));
    collections[c.id] = rows;
  }
  return { fields, collections };
}

function valueOf(field: PackageField, entry: Entry | undefined): FieldValue {
  if (field.type === 'multiselect') {
    const list = Array.isArray(entry) ? entry : [];
    return list.length > 0 ? list : null;
  }
  return valueFromInput(field.type, typeof entry === 'string' ? entry : '');
}

export function toApplicationData(pkg: PackageDetail, values: FormValues): ApplicationData {
  return {
    fields: pkg.fields.map((f) => ({ id: f.id, value: valueOf(f, values.fields[f.id]) })),
    collections: pkg.collections.map((c) => ({
      id: c.id,
      records: (values.collections[c.id] ?? []).map((r) => ({
        id: r.id,
        fields: c.fields.map((f) => ({ id: f.id, value: valueOf(f, r.fields[f.id]) })),
      })),
    })),
  };
}

function FieldInput({
  field,
  entry,
  disabled,
  onChange,
}: {
  field: PackageField;
  entry: Entry | undefined;
  disabled: boolean;
  onChange: (value: Entry) => void;
}): JSX.Element {
  const text = typeof entry === 'string' ? entry : '';
  const label = (
    <span>
      {field.name}
      {field.required ? ' *' : ` (${t('s10Processors.onboarding.optionalField')})`}
    </span>
  );
  if (field.type === 'choice')
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-2"
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('s10Processors.onboarding.none')}</option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.type === 'boolean')
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-2"
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('s10Processors.onboarding.none')}</option>
          <option value="true">{t('s10Processors.onboarding.yes')}</option>
          <option value="false">{t('s10Processors.onboarding.no')}</option>
        </select>
      </label>
    );
  if (field.type === 'multiselect') {
    const chosen = Array.isArray(entry) ? entry : [];
    return (
      <fieldset className="space-y-1 text-sm" disabled={disabled}>
        <legend>{label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(field.choices ?? []).map((c) => (
            <label key={c} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(c)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...chosen, c] : chosen.filter((x) => x !== c))
                }
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const numeric = field.type === 'integer' || field.type === 'decimal' || field.type === 'percent';
  return (
    <label className="block space-y-1 text-sm">
      {label}
      <Input
        type={SECRET_TYPES.has(field.type) ? 'password' : field.type === 'date' ? 'date' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        value={text}
        maxLength={
          field.max !== null && field.max > 0 && field.max < 1000 && !numeric ? field.max : 1000
        }
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function PackageForm({
  pkg,
  values,
  disabled,
  onChange,
}: {
  pkg: PackageDetail;
  values: FormValues;
  disabled: boolean;
  onChange: (next: FormValues) => void;
}): JSX.Element {
  return (
    <div className="space-y-sp-16">
      {pkg.rules.length > 0 ? (
        <div className="rounded-md border p-sp-12 text-sm">
          <p className="font-medium">{t('s10Processors.onboarding.rules')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {pkg.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        {pkg.fields.map((f) => (
          <FieldInput
            key={f.id}
            field={f}
            entry={values.fields[f.id]}
            disabled={disabled}
            onChange={(v) => onChange({ ...values, fields: { ...values.fields, [f.id]: v } })}
          />
        ))}
      </div>
      {pkg.collections.map((c) => {
        const rows = values.collections[c.id] ?? [];
        return (
          <section key={c.id} className="space-y-sp-12 rounded-md border p-sp-12">
            <div>
              <h3 className="font-medium">{c.name}</h3>
              {c.description !== '' ? (
                <p className="text-sm text-muted-foreground">{c.description}</p>
              ) : null}
            </div>
            {rows.map((r, index) => (
              <div key={r.id} className="space-y-sp-12 rounded-md bg-muted/30 p-sp-12">
                <p className="text-sm font-medium">
                  {t('s10Processors.onboarding.recordTitle', { name: c.name, index: index + 1 })}
                </p>
                <div className="grid gap-sp-12 sm:grid-cols-2">
                  {c.fields.map((f) => (
                    <FieldInput
                      key={f.id}
                      field={f}
                      entry={r.fields[f.id]}
                      disabled={disabled}
                      onChange={(v) =>
                        onChange({
                          ...values,
                          collections: {
                            ...values.collections,
                            [c.id]: rows.map((x) =>
                              x.id === r.id ? { ...x, fields: { ...x.fields, [f.id]: v } } : x,
                            ),
                          },
                        })
                      }
                    />
                  ))}
                </div>
                {rows.length > c.min ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...values,
                        collections: {
                          ...values.collections,
                          [c.id]: rows.filter((x) => x.id !== r.id),
                        },
                      })
                    }
                  >
                    {t('s10Processors.onboarding.removeRecord')}
                  </Button>
                ) : null}
              </div>
            ))}
            {rows.length < c.max ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  const fields: Record<string, Entry> = {};
                  for (const f of c.fields) fields[f.id] = entryOf(f, undefined);
                  onChange({
                    ...values,
                    collections: {
                      ...values.collections,
                      [c.id]: [...rows, { id: newRecordId(), fields }],
                    },
                  });
                }}
              >
                {t('s10Processors.onboarding.addRecord', { name: c.name })}
              </Button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
