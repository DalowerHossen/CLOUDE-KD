// path: app/(admin)/admin/setup/_components/setup-wizard.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SetupView } from '@/services/company/platform-setup';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s07Company.adminOps.${k}` as never);

export function SetupWizard({ view }: { view: SetupView }): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<'solo' | 'team'>(view.soloMode ? 'solo' : 'team');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(body: Record<string, unknown>): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/companies/admin/setup', 'POST', body);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('done') });
      router.refresh();
    }
  }

  const done = (key: string): boolean => view.steps.some((s) => s.key === key && s.done);
  const badge = (key: string): JSX.Element => (
    <Badge variant="outline">{done(key) ? p('setupDone') : p('setupOpen')}</Badge>
  );

  return (
    <div className="space-y-sp-16">
      {view.complete ? <p role="status">{p('setupAllDone')}</p> : null}
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <div className="flex items-center justify-between gap-sp-8">
          <h2 className="text-h4 font-semibold">1. {p('approvalMode')}</h2>
          {badge('approval_mode')}
        </div>
        <p className="text-sm text-muted-foreground">{p('approvalModeHelp')}</p>
        <fieldset className="space-y-sp-8 text-sm">
          <label className="flex items-center gap-sp-8">
            <input
              type="radio"
              name="mode"
              checked={mode === 'team'}
              onChange={() => setMode('team')}
            />
            {p('modeTeam')}
          </label>
          <label className="flex items-center gap-sp-8">
            <input
              type="radio"
              name="mode"
              checked={mode === 'solo'}
              onChange={() => setMode('solo')}
            />
            {p('modeSolo')}
          </label>
        </fieldset>
        <Button type="button" onClick={() => void save({ step: 'approval_mode', choice: mode })}>
          {p('apply')}
        </Button>
      </section>
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <div className="flex items-center justify-between gap-sp-8">
          <h2 className="text-h4 font-semibold">2. {p('emailStep')}</h2>
          {badge('email')}
        </div>
        <p className="text-sm text-muted-foreground">{p('emailHelp')}</p>
        <div className="flex flex-wrap gap-sp-8">
          <Link className="underline" href="/admin/emails">
            {p('emailLink')}
          </Link>
          <Button type="button" onClick={() => void save({ step: 'email', choice: 'confirmed' })}>
            {p('confirm')}
          </Button>
        </div>
      </section>
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <div className="flex items-center justify-between gap-sp-8">
          <h2 className="text-h4 font-semibold">3. {p('securityStep')}</h2>
          {badge('security')}
        </div>
        <p className="text-sm text-muted-foreground">{p('securityHelp')}</p>
        <div className="flex flex-wrap gap-sp-8">
          <Link className="underline" href="/admin/security">
            {p('securityLink')}
          </Link>
          <Button
            type="button"
            onClick={() => void save({ step: 'security', choice: 'confirmed' })}
          >
            {p('confirm')}
          </Button>
        </div>
      </section>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
