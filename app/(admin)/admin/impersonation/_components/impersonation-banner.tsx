// path: app/(admin)/admin/impersonation/_components/impersonation-banner.tsx
import { UserCheck } from 'lucide-react';
import { t } from '@/lib/i18n';
import { currentActor } from '@/services/auth/actor';
import { EndImpersonationButton } from './end-impersonation-button';

/** Server component. Renders nothing for normal sessions; a fixed banner with an end button while impersonating. */
export async function ImpersonationBanner(): Promise<JSX.Element | null> {
  const actor = await currentActor().catch(() => null);
  if (!actor || actor.impersonatedBy === null) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-2 bg-warning px-sp-16 py-sp-8 text-warning-foreground"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <UserCheck className="h-4 w-4" aria-hidden="true" />
        {t('s03Auth.impersonation.banner', { email: actor.email })}
      </p>
      <EndImpersonationButton />
    </div>
  );
}
