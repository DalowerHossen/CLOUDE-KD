// path: app/(admin)/admin/_components/search-form.tsx
// A GET form for the list pages: the filters live in the address, the server does the search.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

export interface FilterOption {
  value: string;
  label: string;
}

export function SearchForm({
  action,
  q,
  placeholder,
  filters,
}: {
  action: string;
  q: string;
  placeholder: string;
  filters: { name: string; value: string; allLabel: string; options: FilterOption[] }[];
}): JSX.Element {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-col gap-sp-8 sm:flex-row sm:items-end"
      role="search"
    >
      <Input
        name="q"
        defaultValue={q}
        maxLength={80}
        placeholder={placeholder}
        aria-label={t('s07Company.adminPeople.search')}
      />
      {filters.map((f) => (
        <NativeSelect key={f.name} name={f.name} defaultValue={f.value} aria-label={f.allLabel}>
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      <Button type="submit">{t('s07Company.adminPeople.apply')}</Button>
    </form>
  );
}
