// path: app/(auth)/join/page.tsx
import type { Metadata } from 'next';
import { JoinForm } from '@/components/settings/join-form';
import { t } from '@/lib/i18n';
import { peekInvitation } from '@/services/team/invitations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join your team' };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' ? raw : '';
  const invitation = token ? await peekInvitation(token).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-md space-y-sp-16">
      <h1 className="text-h2 font-semibold">{t('s07Company.join.title')}</h1>
      {invitation ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('s07Company.join.intro', {
              company: invitation.companyName,
              email: invitation.email,
            })}
          </p>
          <JoinForm token={token} />
        </>
      ) : (
        <p role="alert" className="rounded-md border p-sp-12 text-sm">
          {t('s07Company.join.invalid')}
        </p>
      )}
    </div>
  );
}
