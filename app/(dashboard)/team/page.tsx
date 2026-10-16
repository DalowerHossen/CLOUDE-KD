// path: app/(dashboard)/team/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { permissions as registered } from '@/config/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { TeamManager } from '@/components/settings/team-manager';
import { getService } from '@/lib/container';
import { STAFF_PRESETS, expandPreset, matrix } from '@/lib/team/presets';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listInvitations } from '@/services/team/invitations';
import { listMembers, seatState } from '@/services/team/members';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('team.read', 'tenant', 'team');
  const permissions = getService('permissions');
  const [canManage, canPermissions] = await Promise.all([
    permissions.can(actor, 'team.manage', { type: 'team' }),
    permissions.can(actor, 'team.permissions', { type: 'team' }),
  ]);
  let data: {
    members: Awaited<ReturnType<typeof listMembers>>;
    invitations: Awaited<ReturnType<typeof listInvitations>>;
    seats: Awaited<ReturnType<typeof seatState>>;
  } | null;
  try {
    const companyId = actor.companyId as string;
    const [members, invitations, seats] = await Promise.all([
      listMembers(companyId),
      listInvitations(companyId),
      seatState(companyId),
    ]);
    data = { members, invitations, seats };
  } catch {
    data = null;
  }
  const presets = Object.fromEntries(
    STAFF_PRESETS.map((p) => [p.key, expandPreset(p.key, registered)]),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.team.title')}
        description={t('s07Company.team.description')}
        actions={
          <Link className="underline" href="/team/security">
            {t('s07Company.team.securityLink')}
          </Link>
        }
      />
      {data === null ? (
        <ErrorState description={t('s07Company.team.loadError')} />
      ) : (
        <TeamManager
          {...data}
          matrix={matrix(registered)}
          presets={presets}
          canManage={canManage}
          canPermissions={canPermissions}
        />
      )}
    </div>
  );
}
