// path: app/(dashboard)/account/security/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { currentActor } from '@/services/auth/actor';
import {
  listSessions,
  securitySummary,
  type SecuritySummary,
  type SessionItem,
} from '@/services/auth/account-ops';
import { enabledProviders } from '@/services/auth/oauth-flow';
import type { OAuthProvider } from '@/lib/auth/oauth';
import { PasswordForm } from './_components/password-form';
import { ProvidersPanel } from './_components/providers-panel';
import { SessionsPanel } from './_components/sessions-panel';
import { TwoFactorPanel } from './_components/two-factor-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security' };

interface DeviceItem {
  id: string;
  label: string;
  network: string;
  firstSeen: string;
}

const deviceColumns: readonly DataColumn<DeviceItem>[] = [
  {
    key: 'label',
    header: t('s03Auth.security.colDevice'),
    primary: true,
    cell: (r) => r.label || '-',
  },
  { key: 'network', header: t('s03Auth.security.colNetwork'), cell: (r) => r.network },
  {
    key: 'first',
    header: t('s03Auth.security.colFirstSeen'),
    cell: (r) => r.firstSeen.replace('T', ' ').slice(0, 16),
  },
];

export default async function SecurityPage(): Promise<JSX.Element> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  let data: {
    summary: SecuritySummary;
    own: SessionItem[];
    team: SessionItem[];
    devices: DeviceItem[];
    linked: OAuthProvider[];
    available: OAuthProvider[];
  } | null;
  try {
    const admin = getAdminSupabase();
    const [summary, own, team, devices, identities, available] = await Promise.all([
      securitySummary(actor),
      listSessions(actor, false),
      actor.role === 'owner' ? listSessions(actor, true) : Promise.resolve([] as SessionItem[]),
      admin
        .from('user_devices')
        .select('id, label, last_ip_masked, first_seen_at')
        .eq('user_id', actor.userId)
        .is('deleted_at', null)
        .order('last_seen_at', { ascending: false })
        .limit(50),
      admin
        .from('oauth_identities')
        .select('provider')
        .eq('user_id', actor.userId)
        .is('deleted_at', null),
      enabledProviders(),
    ]);
    data = {
      summary,
      own,
      team: team.filter((s) => s.userId !== actor.userId),
      devices: (devices.data ?? []).map((d) => ({
        id: String(d.id),
        label: String(d.label),
        network: d.last_ip_masked ? String(d.last_ip_masked) : 'unknown',
        firstSeen: String(d.first_seen_at),
      })),
      linked: (identities.data ?? [])
        .map((r) => String(r.provider))
        .filter((p): p is OAuthProvider => p === 'google' || p === 'github'),
      available,
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s03Auth.security.title')}
        description={t('s03Auth.security.description')}
      />
      {data === null ? (
        <ErrorState description={t('s03Auth.security.loadError')} />
      ) : (
        <>
          <StepUpForm />
          <TwoFactorPanel
            active={data.summary.twoFactorActive}
            backupCodesLeft={data.summary.backupCodesLeft}
            canDisable={data.summary.canDisableTwoFactor}
            mustHave
          />
          <ProvidersPanel linked={data.linked} available={data.available} />
          <PasswordForm email={actor.email} />
          <SessionsPanel sessions={data.own} ownerView={false} />
          {actor.role === 'owner' ? <SessionsPanel sessions={data.team} ownerView /> : null}
          <section className="space-y-sp-12" aria-labelledby="dev-title">
            <h2 id="dev-title" className="text-h4 font-semibold">
              {t('s03Auth.security.devicesTitle')}
            </h2>
            <DataTable
              columns={deviceColumns}
              rows={data.devices}
              getRowId={(r) => r.id}
              caption={t('s03Auth.security.devicesCaption')}
            />
          </section>
        </>
      )}
    </div>
  );
}
