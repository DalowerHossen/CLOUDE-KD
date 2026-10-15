// path: app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { AppProviders } from '@/components/shared/app-providers';
import { ThemeInitScript } from '@/components/shared/theme-init-script';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const NAME = 'KD SOLUTION IT';
const DESCRIPTION = 'Invoicing, payments, payroll and accounting for growing businesses.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: NAME, template: `%s | ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: NAME,
    title: NAME,
    description: DESCRIPTION,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: NAME,
    description: DESCRIPTION,
    images: ['/og-default.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1c' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  // The middleware (STEP 04) sets x-nonce for the nonce-based content security policy.
  const nonce = headers().get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript nonce={nonce} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
