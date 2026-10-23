// path: app/(dashboard)/whatsapp/tabs.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';

const TABS: readonly (readonly [string, StringKey])[] = [
  ['/whatsapp', 's16Whatsapp.tabs.connection'],
  ['/whatsapp/templates', 's16Whatsapp.tabs.templates'],
  ['/whatsapp/messages', 's16Whatsapp.tabs.messages'],
  ['/whatsapp/contacts', 's16Whatsapp.tabs.contacts'],
  ['/whatsapp/rules', 's16Whatsapp.tabs.rules'],
  ['/whatsapp/campaigns', 's16Whatsapp.tabs.campaigns'],
];

/** The links between the four WhatsApp pages. */
export function WhatsAppTabs({ current }: { current: string }): JSX.Element {
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
