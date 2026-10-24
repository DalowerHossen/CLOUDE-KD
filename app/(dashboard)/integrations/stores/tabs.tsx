// path: app/(dashboard)/integrations/stores/tabs.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';

const TABS: readonly (readonly [string, StringKey])[] = [
  ['/integrations/stores', 's16Commerce.tabs.stores'],
  ['/integrations/stores/orders', 's16Commerce.tabs.orders'],
  ['/integrations/stores/conflicts', 's16Commerce.tabs.conflicts'],
];

/** The links between the store pages. */
export function StoreTabs({ current }: { current: string }): JSX.Element {
  return (
    <>
      {TABS.map(([href, label]) => (
        <Button key={href} asChild variant={href === current ? 'default' : 'outline'} size="sm">
          <Link href={href} prefetch={false}>
            {t(label)}
          </Link>
        </Button>
      ))}
    </>
  );
}
