// path: app/embed/[token]/page.tsx
// The checkout page that the merchant SDK shows in a frame. It answers only when the calling web site (?origin=) is on the
// merchant's list for this payment link; the proxy also limits who may frame it (CSP frame-ancestors). Never indexed.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmbedFrame } from '@/components/payment/embed-frame';
import { embedPageParams, embedPageQuery, normalizeOrigin } from '@/lib/payment/embed-sdk/rules';
import { ancestorsFor } from '@/services/payment/embed';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Secure checkout',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const parsedParams = embedPageParams.safeParse(await params);
  const parsedQuery = embedPageQuery.safeParse(await searchParams);
  if (!parsedParams.success || !parsedQuery.success) notFound();
  const { origin: rawOrigin, ...style } = parsedQuery.data;
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) notFound();
  const allowed = await ancestorsFor(parsedParams.data.token);
  if (!allowed.includes(origin)) notFound();
  return <EmbedFrame token={parsedParams.data.token} parentOrigin={origin} style={style} />;
}
