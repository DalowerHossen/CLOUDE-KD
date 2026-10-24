// path: components/settings/settings-tabs.tsx
import Link from 'next/link';
import { t } from '@/lib/i18n';

const TABS = [
  { href: '/settings/company', key: 'company' },
  { href: '/settings/branding', key: 'branding' },
  { href: '/settings/invoicing', key: 'invoicing' },
  { href: '/settings/notifications', key: 'notifications' },
  { href: '/settings/display', key: 'display' },
] as const;

/** Links between the company settings screens. */
export function SettingsTabs({ current }: { current: (typeof TABS)[number]['key'] }): JSX.Element {
  return (
    <nav aria-label={t('s07Company.settings.tabsLabel')} className="flex flex-wrap gap-2 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? 'page' : undefined}
          className={`rounded-full border px-3 py-1 ${tab.key === current ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {t(`s07Company.settings.tabs.${tab.key}`)}
        </Link>
      ))}
    </nav>
  );
}
