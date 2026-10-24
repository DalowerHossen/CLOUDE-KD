// path: app/(client-portal)/skyc/[token]/page.tsx
import { headers } from 'next/headers';
import { BusinessForm } from '@/components/gateway/kyc-forms';
import { KycPanel } from '@/components/settings/kyc-panel';
import { getClientIp } from '@/lib/api/client-ip';
import { t } from '@/lib/i18n';
import { applicantView, type ApplicantView } from '@/services/gateway/kyc-applicant';
import { resolveKycLink } from '@/services/gateway/kyc-links';

// A secure-link page is always built for the request: it checks the link and the rate limits each time.
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<JSX.Element> {
  const { token } = await params;
  let view: ApplicantView | null = null;
  try {
    const link = await resolveKycLink(token, getClientIp(await headers()));
    view = link ? await applicantView(link) : null;
  } catch {
    view = null;
  }
  if (view === null)
    return (
      <div className="space-y-sp-8">
        <h1 className="text-h3 font-semibold">{t('s16Gateway.applicant.invalidTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('s16Gateway.applicant.invalid')}</p>
      </div>
    );
  const locked = ['submitted', 'in_review', 'approved'].includes(view.status);
  return (
    <div className="space-y-sp-24">
      <header className="space-y-1">
        <h1 className="text-h3 font-semibold">{t('s16Gateway.applicant.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('s16Gateway.applicant.intro', { name: view.subMerchantName })}
        </p>
      </header>
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <h2 className="text-h4 font-semibold">{t('s16Gateway.applicant.businessTitle')}</h2>
        <BusinessForm
          token={token}
          initialName={view.businessName}
          initialCountry={view.businessCountry}
          locked={locked}
        />
      </section>
      <KycPanel view={view} endpoint={`/api/gateway-kyc/${token}`} />
    </div>
  );
}
