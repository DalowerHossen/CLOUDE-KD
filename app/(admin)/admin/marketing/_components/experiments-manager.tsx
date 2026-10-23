// path: app/(admin)/admin/marketing/_components/experiments-manager.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import type { ExperimentRow } from '@/services/marketing/admin';
import { useCall } from './use-call';

const GOALS = ['signup_click', 'contact_sent', 'cta_click', 'free_tool_used'] as const;

export function ExperimentsManager({
  rows,
  canEdit,
}: {
  rows: ExperimentRow[];
  canEdit: boolean;
}): JSX.Element {
  const { busy, message, call } = useCall();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('signup_click');
  const [heading, setHeading] = useState('');
  const [subheading, setSubheading] = useState('');
  const [cta, setCta] = useState('');
  const act = (body: Record<string, unknown>): Promise<boolean> =>
    call('PUT', '/api/marketing/experiments', body);
  return (
    <section className="space-y-sp-12" aria-labelledby="ab-title">
      <h2 id="ab-title" className="text-h3 font-semibold">
        {t('s06Public.marketingAdmin.experiments')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('s06Public.marketingAdmin.experimentsHelp')}
      </p>
      <ul className="space-y-sp-12">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border p-sp-12 text-sm">
            <p className="font-medium">
              {r.name} ({r.key}) - {r.status}
              {r.winner ? ` - ${t('s06Public.marketingAdmin.winner')}: ${r.winner}` : ''}
            </p>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th>{t('s06Public.marketingAdmin.variant')}</th>
                  <th>{t('s06Public.marketingAdmin.exposures')}</th>
                  <th>{t('s06Public.marketingAdmin.conversions')}</th>
                  <th>{t('s06Public.marketingAdmin.rate')}</th>
                  <th>{t('s06Public.marketingAdmin.significant')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.results.map((v) => (
                  <tr key={v.variant}>
                    <td>{v.variant}</td>
                    <td>{v.exposures}</td>
                    <td>{v.conversions}</td>
                    <td>{(v.rate * 100).toFixed(1)}%</td>
                    <td>
                      {v.significant === null
                        ? '-'
                        : v.significant
                          ? t('s06Public.marketingAdmin.yes', { p: (v.pValue ?? 1).toFixed(3) })
                          : t('s06Public.marketingAdmin.no')}
                    </td>
                    <td>
                      {canEdit && !r.winner ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void act({ action: 'winner', id: r.id, variant: v.variant })
                          }
                        >
                          {t('s06Public.marketingAdmin.pickWinner')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit ? (
              <div className="flex gap-2">
                {r.status === 'draft' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act({ action: 'start', id: r.id })}
                  >
                    {t('s06Public.marketingAdmin.start')}
                  </Button>
                ) : null}
                {r.status === 'running' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act({ action: 'stop', id: r.id })}
                  >
                    {t('s06Public.marketingAdmin.stop')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act({ action: 'delete', id: r.id })}
                >
                  {t('s06Public.cms.remove')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-sp-12 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call('POST', '/api/marketing/experiments', {
              id: null,
              key,
              name,
              goalEvent: goal,
              variants: [
                { key: 'control', heading: '', subheading: '', ctaLabel: '' },
                { key: 'b', heading, subheading, ctaLabel: cta },
              ],
            }).then((ok) => {
              if (ok) {
                setKey('');
                setName('');
                setHeading('');
                setSubheading('');
                setCta('');
              }
            });
          }}
        >
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.expKey')}</span>
            <Input
              value={key}
              maxLength={40}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.blogAdmin.name')}</span>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.goal')}</span>
            <NativeSelect
              value={goal}
              onChange={(e) => setGoal(e.target.value as (typeof GOALS)[number])}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.variantHeading')}</span>
            <Input value={heading} maxLength={120} onChange={(e) => setHeading(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.variantSub')}</span>
            <Input
              value={subheading}
              maxLength={400}
              onChange={(e) => setSubheading(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.variantCta')}</span>
            <Input value={cta} maxLength={40} onChange={(e) => setCta(e.target.value)} />
          </label>
          <div>
            <Button
              type="submit"
              disabled={
                busy || key.length < 3 || name.length < 3 || (!heading && !subheading && !cta)
              }
            >
              {t('s06Public.cms.create')}
            </Button>
          </div>
        </form>
      ) : null}
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
