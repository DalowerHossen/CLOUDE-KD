// path: app/(public)/status/page.tsx
import type { Metadata } from 'next';
import { StatusView } from '@/components/marketing/status-view';
import { t } from '@/lib/i18n';
import { loadStatus } from '@/services/support/status';

export const revalidate = 60;
export const metadata: Metadata = {
  title: t('s06Public.status.title'),
  description: t('s06Public.status.description'),
  alternates: { canonical: '/status' },
};

export default async function StatusPage(): Promise<JSX.Element> {
  const data = await loadStatus();
  return (
    <section className="mx-auto w-full max-w-4xl space-y-sp-24 px-sp-16 py-sp-48">
      <header className="space-y-2">
        <h1 className="text-h1 font-bold tracking-tight">{t('s06Public.status.title')}</h1>
        <p className="text-lead text-muted-foreground">{t('s06Public.status.description')}</p>
      </header>
      <StatusView data={data} />
    </section>
  );
}
