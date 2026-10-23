// path: app/(public)/help/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpSearch } from '@/components/marketing/help-search';
import { t } from '@/lib/i18n';
import { groupByCategory, listHelpArticles } from '@/services/help/help';

export const revalidate = 300;
export const metadata: Metadata = {
  title: t('s06Public.help.title'),
  description: t('s06Public.help.description'),
  alternates: { canonical: '/help' },
};

export default async function HelpPage(): Promise<JSX.Element> {
  const groups = groupByCategory(await listHelpArticles());
  return (
    <section className="mx-auto w-full max-w-7xl space-y-sp-24 px-sp-16 py-sp-48">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-h1 font-bold tracking-tight">{t('s06Public.help.title')}</h1>
        <p className="text-lead text-muted-foreground">{t('s06Public.help.description')}</p>
      </header>
      <HelpSearch groups={groups} />
      <p className="text-sm">
        {t('s06Public.help.more')}{' '}
        <Link className="underline" href="/faq">
          {t('s06Public.help.faq')}
        </Link>
        {' - '}
        <Link className="underline" href="/status">
          {t('s06Public.help.status')}
        </Link>
        {' - '}
        <Link className="underline" href="/contact">
          {t('s06Public.help.contact')}
        </Link>
      </p>
    </section>
  );
}
