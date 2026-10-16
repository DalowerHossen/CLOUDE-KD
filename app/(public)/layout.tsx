// path: app/(public)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { PublicFrame } from '@/components/marketing/public-frame';
import { navMap } from '@/config/nav-map';
import { readSeoSettings } from '@/services/seo/settings';

/** Site verification tags for search engines, from the SEO settings. */
export async function generateMetadata(): Promise<Metadata> {
  const { verification: v } = await readSeoSettings();
  const other: Record<string, string> = {};
  if (v.bing) other['msvalidate.01'] = v.bing;
  if (v.pinterest) other['p:domain_verify'] = v.pinterest;
  if (v.facebook) other['facebook-domain-verification'] = v.facebook;
  return {
    verification: {
      ...(v.google ? { google: v.google } : {}),
      ...(v.yandex ? { yandex: v.yandex } : {}),
      other,
    },
  };
}

export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <PublicFrame
      headerItems={visibleNavItems(navMap, 'public-header', null)}
      footerItems={visibleNavItems(navMap, 'public-footer', null)}
    >
      {children}
    </PublicFrame>
  );
}
