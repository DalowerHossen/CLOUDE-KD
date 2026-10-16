// path: components/marketing/public-frame.tsx
import type { ReactNode } from 'react';
import { SkipLink } from '@/components/layout/skip-link';
import type { NavItem } from '@/config/nav-types';
import type { PixelSettings } from '@/lib/analytics/providers';
import { ConsentBanner } from './consent-banner';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TrackingLoader } from './tracking-loader';

interface Props {
  headerItems: readonly NavItem[];
  footerItems: readonly NavItem[];
  children: ReactNode;
  pixels: PixelSettings;
}

/** Frame of every public page: skip link, header, main content, footer and the cookie banner. */
export function PublicFrame({ headerItems, footerItems, children, pixels }: Props): JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <SiteHeader items={headerItems} />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter items={footerItems} />
      <ConsentBanner />
      <TrackingLoader pixels={pixels} />
    </div>
  );
}
