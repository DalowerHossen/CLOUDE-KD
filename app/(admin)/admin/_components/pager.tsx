// path: app/(admin)/admin/_components/pager.tsx
import Link from 'next/link';
import { PAGE_SIZE } from '@/lib/company/admin-input';
import { t } from '@/lib/i18n';

export function Pager({
  base,
  params,
  page,
  total,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
}): JSX.Element | null {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p: number): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `${base}?${sp.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Pages">
      {page > 1 ? (
        <Link className="underline" href={href(page - 1)}>
          {t('s07Company.adminPeople.previous')}
        </Link>
      ) : (
        <span />
      )}
      <span>{t('s07Company.adminPeople.page', { page, pages })}</span>
      {page < pages ? (
        <Link className="underline" href={href(page + 1)}>
          {t('s07Company.adminPeople.next')}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
