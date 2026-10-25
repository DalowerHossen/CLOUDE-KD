// path: app/(admin)/admin/_components/modules-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ModuleDef } from '@/config/features';
import { t } from '@/lib/i18n';
import type { FlagView } from '@/services/company/flags';
import { sendJson } from './post-json';

const p = (k: string): string => t(`s07Company.adminModules.${k}` as never);

/**
 * One switch per optional module. With a company id the switch is that company's own setting; without one it is the
 * setting for all companies. No setting at all means off.
 */
export function ModulesPanel({
  modules,
  flags,
  companyId,
  canManage,
}: {
  modules: readonly ModuleDef[];
  flags: readonly FlagView[];
  companyId: string | null;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function set(module: ModuleDef, enabled: boolean): Promise<void> {
    const own = flags.find((f) => f.key === module.key && f.companyId === companyId);
    setBusy(module.key);
    setMessage(null);
    const error = await sendJson('/api/companies/admin/flags', 'PUT', {
      key: module.key,
      companyId,
      enabled,
      rolloutPercent: own?.rolloutPercent ?? 100,
      version: own?.version ?? null,
    });
    setBusy(null);
    if (error) setMessage(error);
    else router.refresh();
  }

  return (
    <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
      <div>
        <h2 className="text-h3 font-semibold">{p('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {companyId ? p('descriptionCompany') : p('descriptionGlobal')}
        </p>
      </div>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <ul className="divide-y text-sm">
        {modules.map((m) => {
          const own = flags.find((f) => f.key === m.key && f.companyId === companyId);
          const global = flags.find((f) => f.key === m.key && f.companyId === null);
          const on = own ? own.enabled : companyId ? (global?.enabled ?? false) : false;
          const state = own
            ? own.enabled
              ? companyId
                ? p('stateOnCompany')
                : p('stateOnAll')
              : companyId
                ? p('stateOffCompany')
                : p('stateOffDefault')
            : global?.enabled && companyId
              ? p('stateOnAll')
              : p('stateOffDefault');
          return (
            <li
              key={m.key}
              className="flex flex-wrap items-center justify-between gap-sp-8 py-sp-12"
            >
              <div className="min-w-0">
                <p className="font-medium">{m.label}</p>
                <p className="text-muted-foreground">{m.description}</p>
                <p className="break-all text-caption text-muted-foreground">{m.key}</p>
              </div>
              <div className="flex items-center gap-sp-8">
                <Badge variant="outline">{state}</Badge>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === m.key}
                    onClick={() => void set(m, !on)}
                  >
                    {on ? p('turnOff') : p('turnOn')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
