// path: app/(admin)/admin/setup/_components/setup-wizard.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SetupView, WizardStepView } from '@/services/company/platform-setup';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s07Company.adminOps.${k}` as never);

const LINKS: Record<WizardStepView['key'], string> = {
  branding: '/admin/cms',
  email: '/admin/emails',
  gateways: '/admin/processors',
  plans: '/admin/plans',
  domains: '/admin/seo',
  payouts: '/admin/payouts/settings',
  whatsapp: '/whatsapp',
  analytics: '/admin/analytics',
};
const NAME: Record<WizardStepView['key'], string> = {
  branding: 'Branding',
  email: 'Email',
  gateways: 'Gateways',
  plans: 'Plans',
  domains: 'Domains',
  payouts: 'Payouts',
  whatsapp: 'Whatsapp',
  analytics: 'Analytics',
};

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

  const finished = view.steps.filter((s) => s.done).length;
  const detectedText = (d: boolean | null): string =>
    d === null ? p('wizDetectedUnknown') : d ? p('wizDetectedYes') : p('wizDetectedNo');

  return (
    <div className="space-y-sp-16">
      <p role="status" className="text-sm">
        {p('wizProgress')}: {finished} / {view.steps.length}
        {view.complete ? ` - ${p('setupAllDone')}` : ''}
      </p>
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <div className="flex items-center justify-between gap-sp-8">
          <h2 className="text-h4 font-semibold">
            {p('wizBefore')}: {p('approvalMode')}
          </h2>
          <Badge variant="outline">{view.approvalDone ? p('setupDone') : p('setupOpen')}</Badge>
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
      {view.steps.map((step, index) => (
        <section key={step.key} className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <div className="flex flex-wrap items-center justify-between gap-sp-8">
            <h2 className="text-h4 font-semibold">
              {index + 1}. {p(`wiz${NAME[step.key]}Title`)}
            </h2>
            <div className="flex gap-sp-8">
              {step.optional ? <Badge variant="outline">{p('wizOptional')}</Badge> : null}
              <Badge variant="outline">
                {step.done ? (step.skipped ? p('wizSkipped') : p('setupDone')) : p('setupOpen')}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{p(`wiz${NAME[step.key]}Help`)}</p>
          <p className="text-sm">{detectedText(step.detected)}</p>
          <div className="flex flex-wrap items-center gap-sp-8">
            <Link className="underline" href={LINKS[step.key]}>
              {p(`wiz${NAME[step.key]}Link`)}
            </Link>
            <Button
              type="button"
              onClick={() => void save({ step: step.key, choice: 'confirmed' })}
            >
              {p('wizMarkDone')}
            </Button>
            {step.optional ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void save({ step: step.key, choice: 'skipped' })}
              >
                {p('wizSkip')}
              </Button>
            ) : null}
          </div>
        </section>
      ))}
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <h2 className="text-h4 font-semibold">{p('wizChecklist')}</h2>
        <ul className="space-y-sp-4 text-sm">
          {view.steps.map((step) => (
            <li key={step.key}>
              {step.done ? '[x]' : '[ ]'} {p(`wiz${NAME[step.key]}Title`)}
              {step.skipped ? ` (${p('wizSkipped')})` : ''}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{p('wizRerunHelp')}</p>
        <Button type="button" variant="outline" onClick={() => void save({ step: 'reset' })}>
          {p('wizRerun')}
        </Button>
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
