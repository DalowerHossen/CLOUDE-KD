// path: components/admin/compliance/retention-editor.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

interface Props {
  dataType: string;
  jurisdiction: string;
  days: number;
  action: 'delete' | 'anonymize' | 'archive';
  legalBasis: string;
  enabled: boolean;
  version: number;
}

export function RetentionEditor(props: Props): JSX.Element {
  const router = useRouter();
  const [days, setDays] = useState(String(props.days));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const valid = /^\d{1,5}$/.test(days) && Number(days) >= 1 && Number(days) <= 36500;

  async function save(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/compliance/retention', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dataType: props.dataType,
          jurisdiction: props.jurisdiction,
          retentionDays: Number(days),
          action: props.action,
          legalBasis: props.legalBasis,
          enabled: props.enabled,
          expectedVersion: props.version,
        }),
      });
      setStatus(
        response.ok ? t('s02Governance.compliance.retentionSaved') : t('s01Core.states.errorBody'),
      );
      if (response.ok) router.refresh();
    } catch {
      setStatus(t('s01Core.states.errorBody'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        inputMode="numeric"
        className="w-28"
        value={days}
        aria-label={t('s02Governance.compliance.daysFor', { type: props.dataType })}
        onChange={(event) => setDays(event.target.value)}
      />
      <Button type="button" size="sm" variant="outline" disabled={busy || !valid} onClick={save}>
        {t('s02Governance.compliance.saveDays')}
      </Button>
      <span aria-live="polite" className="text-caption text-muted-foreground">
        {status}
      </span>
    </div>
  );
}
