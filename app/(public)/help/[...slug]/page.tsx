// path: app/(public)/help/[...slug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';
import { HELP_PAGES } from '@/lib/cms/defaults';
import { t } from '@/lib/i18n';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string[] }>;
}

const SEGMENT = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;

function slugOf(parts: string[]): string {
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => SEGMENT.test(p))) notFound();
  return `help/${parts.join('/')}`;
}

export function generateStaticParams(): { slug: string[] }[] {
  return Object.keys(HELP_PAGES).map((s) => ({ slug: s.split('/').slice(1) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return cmsMetadata(slugOf((await params).slug));
}

export default async function HelpArticlePage({ params }: Props): Promise<JSX.Element> {
  const slug = slugOf((await params).slug);
  return (
    <>
      <p className="mx-auto w-full max-w-7xl px-sp-16 pt-sp-24 text-sm">
        <Link className="underline" href="/help">
          {t('s06Public.help.back')}
        </Link>
      </p>
      <CmsPage slug={slug} />
    </>
  );
}
