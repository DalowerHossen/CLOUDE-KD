// path: components/crm/record-presence.tsx
'use client';
import { useEffect } from 'react';
import { Lock, Users } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { PresenceProvider, usePresence } from '@/lib/providers/presence-provider';

function Inner({ resource }: { resource: string }): JSX.Element {
  const presence = usePresence(resource);
  const { others, lock, lockedByOther, startEditing, stopEditing } = presence;

  // The edit lock starts when the person first types in a field of the page and ends when they leave it.
  useEffect(() => {
    const onFocus = (event: FocusEvent): void => {
      const el = event.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        startEditing();
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('focusin', onFocus);
      stopEditing();
    };
  }, [startEditing, stopEditing]);

  const viewers = others.filter((o) => !o.editing);
  const holderName = lock.holder?.name ?? '';
  return (
    <div className="space-y-sp-4 print:hidden" aria-live="polite">
      {lockedByOther ? (
        <Alert variant="warning">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <p>{t('s02Governance.presence.lockedBy', { name: holderName })}</p>
        </Alert>
      ) : null}
      {viewers.length > 0 ? (
        <p className="flex items-center gap-sp-8 text-sm text-muted-foreground">
          <Users className="h-4 w-4" aria-hidden="true" />
          {viewers.length === 1
            ? t('s02Governance.presence.viewing', { names: viewers[0]?.name ?? '' })
            : t('s02Governance.presence.viewingMany', { count: viewers.length })}
        </p>
      ) : null}
    </div>
  );
}

/** Shows who else has this record open and who is editing it. Saving is still protected by the version check. */
export function RecordPresence({
  userId,
  name,
  companyId,
  resource,
}: {
  userId: string;
  name: string;
  companyId: string | null;
  resource: string;
}): JSX.Element {
  return (
    <PresenceProvider identity={{ userId, name, companyId }}>
      <Inner resource={resource} />
    </PresenceProvider>
  );
}
