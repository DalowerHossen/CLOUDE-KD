// path: app/(admin)/admin/cms/_components/field-editor.tsx
'use client';
// Generic editor for the content of one block. It walks the block data: text fields, icon and image pickers, call
// to action parts, price text per plan and lists of items. The server checks every save against the strict schema.
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PLAN_KEYS } from '@/config/plans';
import { ICON_NAMES } from '@/lib/cms/blocks';
import { ITEM_TEMPLATES, OPTIONAL_PARTS } from '@/lib/cms/templates';
import { t } from '@/lib/i18n';
import { MediaPicker } from './media-picker';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const HIDDEN = new Set(['id', 'type']);
const LONG = new Set([
  'text',
  'subheading',
  'intro',
  'quote',
  'answer',
  'footnote',
  'note',
  'caption',
]);

const label = (key: string): string =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

interface Props {
  blockType: string;
  name: string;
  value: Json;
  onChange: (next: Json) => void;
}

export function FieldEditor({ blockType, name, value, onChange }: Props): JSX.Element | null {
  if (typeof value === 'string') {
    if (name === 'icon')
      return (
        <label className="block space-y-1 text-sm">
          <span>{label(name)}</span>
          <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
            {ICON_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </label>
      );
    if (name === 'fileId') return <MediaPicker value={value} onChange={(id) => onChange(id)} />;
    if (name === 'html' || LONG.has(name))
      return (
        <label className="block space-y-1 text-sm">
          <span>{label(name)}</span>
          <Textarea
            value={value}
            rows={name === 'html' ? 10 : 3}
            className={name === 'html' ? 'font-mono text-xs' : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    return (
      <label className="block space-y-1 text-sm">
        <span>{label(name)}</span>
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (typeof value === 'number')
    return (
      <label className="block space-y-1 text-sm">
        <span>{label(name)}</span>
        <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    );
  if (typeof value === 'boolean')
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label(name)}</span>
      </label>
    );
  if (value === null) return null;
  if (Array.isArray(value)) return <ListEditor {...{ blockType, name, value, onChange }} />;
  const obj: Obj = value;
  if (name === 'prices')
    return (
      <fieldset className="space-y-2 rounded-md border p-sp-12">
        <legend className="px-1 text-sm font-medium">{t('s06Public.cms.prices')}</legend>
        {PLAN_KEYS.map((plan) => (
          <label key={plan} className="block space-y-1 text-sm">
            <span>{label(plan)}</span>
            <Input
              value={typeof obj[plan] === 'string' ? obj[plan] : ''}
              maxLength={60}
              onChange={(e) => {
                const next: Obj = { ...obj };
                if (e.target.value) next[plan] = e.target.value;
                else delete next[plan];
                onChange(next);
              }}
            />
          </label>
        ))}
      </fieldset>
    );
  const optional = OPTIONAL_PARTS[blockType] ?? {};
  return (
    <fieldset className="space-y-2 rounded-md border p-sp-12">
      <legend className="px-1 text-sm font-medium">{label(name)}</legend>
      {Object.entries(obj).map(([key, child]) =>
        HIDDEN.has(key) ? null : (
          <FieldEditor
            key={key}
            blockType={blockType}
            name={key}
            value={child}
            onChange={(next) => onChange({ ...obj, [key]: next })}
          />
        ),
      )}
      {name in optional ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
          {t('s06Public.cms.remove')}
        </Button>
      ) : null}
    </fieldset>
  );
}

function ListEditor({ blockType, name, value, onChange }: Props & { value: Json[] }): JSX.Element {
  const template = ITEM_TEMPLATES[`${blockType}.${name}`];
  const isText = value.every((v) => typeof v === 'string');
  if (isText)
    return (
      <label className="block space-y-1 text-sm">
        <span>{label(name)}</span>
        <Textarea
          rows={4}
          value={value.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').filter((l) => l.trim() !== ''))}
        />
      </label>
    );
  return (
    <fieldset className="space-y-sp-12 rounded-md border p-sp-12">
      <legend className="px-1 text-sm font-medium">{label(name)}</legend>
      {value.map((item, i) => (
        <div key={i} className="space-y-2 rounded-md bg-muted/40 p-sp-12">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('s06Public.cms.moveUp')}
              onClick={() => onChange(move(value, i, i - 1))}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('s06Public.cms.moveDown')}
              onClick={() => onChange(move(value, i, i + 1))}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('s06Public.cms.remove')}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {typeof item === 'object' && item !== null && !Array.isArray(item) ? (
            Object.entries(item).map(([key, child]) =>
              HIDDEN.has(key) ? null : (
                <FieldEditor
                  key={key}
                  blockType={blockType}
                  name={key}
                  value={child}
                  onChange={(next) =>
                    onChange(value.map((v, j) => (j === i ? { ...(item as Obj), [key]: next } : v)))
                  }
                />
              ),
            )
          ) : (
            <FieldEditor
              blockType={blockType}
              name={name}
              value={item}
              onChange={(next) => onChange(value.map((v, j) => (j === i ? next : v)))}
            />
          )}
        </div>
      ))}
      {template !== undefined ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, JSON.parse(JSON.stringify(template)) as Json])}
        >
          {t('s06Public.cms.addItem')}
        </Button>
      ) : null}
    </fieldset>
  );
}

/** Optional parts of a block that are not set yet. */
export function missingParts(blockType: string, block: Obj): string[] {
  return Object.keys(OPTIONAL_PARTS[blockType] ?? {}).filter(
    (k) => !(k in block) || block[k] === null,
  );
}
