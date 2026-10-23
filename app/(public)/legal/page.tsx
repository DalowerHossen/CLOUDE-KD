// path: app/(public)/legal/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_LINKS } from '@/lib/cms/legal-pages';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('s06Public.legal.title'),
  description: t('s06Public.legal.description'),
  alternates: { canonical: '/legal' },
};

export default function LegalIndexPage(): JSX.Element {
  return (
    <section className="mx-auto w-full max-w-7xl px-sp-16 py-sp-48">
      <h1 className="text-h1 font-semibold tracking-tight">{t('s06Public.legal.title')}</h1>
      <p className="mt-sp-12 max-w-3xl text-lg text-muted-foreground">
        {t('s06Public.legal.description')}
      </p>
      <ul className="mt-sp-32 grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-3">
        {LEGAL_LINKS.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/legal/${l.slug}`}
              className="block rounded-lg border p-sp-16 font-medium hover:bg-muted/50"
            >
              {t(l.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
