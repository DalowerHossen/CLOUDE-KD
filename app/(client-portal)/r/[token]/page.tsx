// path: app/(client-portal)/r/[token]/page.tsx
import { PortalPage } from '@/components/client/portal-page';

// A token page is always built for the request: it checks the link, the code and the rate limits each time.
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<JSX.Element> {
  const { token } = await params;
  return <PortalPage route="r" token={token} />;
}
