// path: components/settings/companies-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';
import type { MyCompany } from '@/services/company/companies';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function CompaniesPanel({
  companies,
  canAdd,
}: {
  companies: MyCompany[];
  canAdd: boolean;
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/companies/mine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        // The signed account claim changed on the server: take a new token, then reload every screen.
        await getBrowserSupabase()
          .auth.refreshSession()
          .catch(() => undefined);
        router.replace('/dashboard');
        router.refresh();
        return;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setError(err.success ? err.data.error.message : t('s07Company.companies.error'));
    } catch {
      setError(t('s07Company.companies.error'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-16">
      <p className="text-sm text-muted-foreground">{t('s07Company.companies.switchNote')}</p>
      <ul className="divide-y rounded-lg border bg-card text-sm">
        {companies.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12">
            <div className="min-w-0">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted-foreground">
                {c.role === 'owner'
                  ? t('s07Company.companies.owner')
                  : t('s07Company.companies.staff')}
              </p>
            </div>
            {c.active ? (
              <Badge variant="outline">{t('s07Company.companies.active')}</Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy || c.status !== 'active'}
                onClick={() => void run({ action: 'switch', companyId: c.id })}
              >
                {c.status === 'active'
                  ? t('s07Company.companies.switchTo')
                  : t('s07Company.companies.notActive')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canAdd ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s07Company.companies.addTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('s07Company.companies.addHelp')}</p>
          <label className="block text-sm">
            <span className="block font-medium">{t('s07Company.companies.name')}</span>
            <Input
              value={name}
              minLength={2}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() => void run({ action: 'create', name })}
          >
            {t('s07Company.companies.add')}
          </Button>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t('s07Company.companies.planLocked')}</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
