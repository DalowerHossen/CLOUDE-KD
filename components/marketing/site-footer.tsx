// path: components/marketing/site-footer.tsx
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import type { NavItem } from '@/config/nav-types';
import { t, type StringKey } from '@/lib/i18n';
import { CookieSettingsButton } from './consent-banner';

interface Props {
  items: readonly NavItem[];
}

const label = (item: NavItem): string => t(item.labelKey as StringKey);

/** Footer columns are the top-level footer items; their children (items with `parent`) are the links of the column. */
export function SiteFooter({ items }: Props): JSX.Element {
  const columns = items.filter((i) => !i.parent);
  const kids = (id: string): NavItem[] => items.filter((i) => i.parent === id);
  return (
    <footer className="border-t bg-card safe-bottom safe-x">
      <div className="mx-auto grid max-w-7xl gap-sp-24 px-sp-16 py-sp-32 md:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-xs text-caption text-muted-foreground">
            {t('s06Public.footer.tagline')}
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.id} aria-label={label(col)}>
            <h2 className="text-sm font-semibold">
              <Link href={col.href} className="hover:underline">
                {label(col)}
              </Link>
            </h2>
            <ul className="mt-2 space-y-1">
              {kids(col.id).map((kid) => (
                <li key={kid.id}>
                  <Link
                    href={kid.href}
                    className="inline-flex min-h-[32px] items-center text-caption text-muted-foreground hover:text-foreground"
                  >
                    {label(kid)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-sp-16 py-sp-16 text-caption text-muted-foreground">
          <span>
            Copyright {new Date().getUTCFullYear()} {t('s01Core.brand.name')}.{' '}
            {t('s01Core.footer.rights')}
          </span>
          <span className="flex flex-wrap items-center gap-x-4">
            <CookieSettingsButton className="min-h-[32px] hover:text-foreground hover:underline" />
            <Link href="/login" className="hover:text-foreground hover:underline">
              {t('s06Public.footer.signIn')}
            </Link>
            <Link href="/signup" className="hover:text-foreground hover:underline">
              {t('s06Public.footer.createAccount')}
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
