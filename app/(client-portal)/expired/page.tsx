// path: app/(client-portal)/expired/page.tsx
import { StateCard } from '@/components/client/state-card';
import { t } from '@/lib/i18n';

/** A page without a link in its address, for places that must not carry the link (for example after a redirect). */
export default function ExpiredPage(): JSX.Element {
  return (
    <StateCard
      title={t('s13Portal.state.expiredPageTitle')}
      body={t('s13Portal.state.expiredPageBody')}
    />
  );
}
