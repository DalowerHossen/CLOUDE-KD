// path: app/(public)/tools/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('s06Public.tools.title'),
  description: t('s06Public.tools.description'),
  alternates: { canonical: '/tools' },
};

const TOOLS = [
  {
    href: '/tools/invoice-generator',
    title: 's06Public.tools.invoice.title',
    text: 's06Public.tools.invoice.description',
  },
  {
    href: '/tools/late-fee-calculator',
    title: 's06Public.tools.late.title',
    text: 's06Public.tools.late.description',
  },
  {
    href: '/tools/sales-tax-calculator',
    title: 's06Public.tools.tax.title',
    text: 's06Public.tools.tax.description',
  },
] as const;

export default function ToolsPage(): JSX.Element {
  return (
    <section className="mx-auto w-full max-w-7xl px-sp-16 py-sp-48">
      <h1 className="text-h1 font-bold tracking-tight">{t('s06Public.tools.title')}</h1>
      <p className="mt-sp-12 max-w-3xl text-lead text-muted-foreground">
        {t('s06Public.tools.description')}
      </p>
      <ul className="mt-sp-32 grid gap-sp-16 md:grid-cols-3">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="block h-full space-y-2 rounded-lg border bg-card p-sp-24 hover:bg-muted/50"
            >
              <span className="text-h4 font-semibold">{t(tool.title)}</span>
              <span className="block text-muted-foreground">{t(tool.text)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
