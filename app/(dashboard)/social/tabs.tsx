// path: app/(dashboard)/social/tabs.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';

const TABS: readonly (readonly [string, StringKey])[] = [
  ['/social', 's16Social.tabs.accounts'],
  ['/social/posts', 's16Social.tabs.posts'],
];

/** The links between the social media pages. */
export function SocialTabs({ current }: { current: string }): JSX.Element {
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
