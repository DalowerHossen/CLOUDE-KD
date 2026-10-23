// path: components/admin/shared/edit-lock-indicator.tsx
'use client';
import { Lock, Users } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { PresenceApi } from '@/lib/providers/presence-provider';

/** Shows who else is on the page, who holds the edit lock and when it ends. */
export function EditLockIndicator({ presence }: { presence: PresenceApi }): JSX.Element {
  const { others, lock, lockedByOther, editing, startEditing, stopEditing } = presence;
  const holderName = lock.holder?.name ?? '';
  const minutes = lock.expiresInMs === null ? 0 : Math.max(1, Math.ceil(lock.expiresInMs / 60_000));
  const viewers = others.filter((o) => !o.editing);
  return (
    <div className="space-y-2" aria-live="polite">
      {lockedByOther ? (
        <Alert variant="warning">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <div>
            <p>{t('s02Governance.presence.lockedBy', { name: holderName })}</p>
            <p className="text-caption">
              {t('s02Governance.presence.lockExpires', { minutes, name: holderName })}
            </p>
          </div>
        </Alert>
      ) : null}
      {editing ? (
        <Alert variant="info">
          <div>{t('s02Governance.presence.youEditing')}</div>
        </Alert>
      ) : null}
      {viewers.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" aria-hidden="true" />
          {viewers.length === 1
            ? t('s02Governance.presence.viewing', { names: viewers[0]?.name ?? '' })
            : t('s02Governance.presence.viewingMany', { count: viewers.length })}
        </p>
      ) : null}
      {editing ? (
        <Button type="button" variant="outline" size="sm" onClick={stopEditing}>
          {t('s02Governance.presence.stopEditing')}
        </Button>
      ) : (
        <Button type="button" size="sm" disabled={lockedByOther} onClick={startEditing}>
          {t('s02Governance.presence.startEditing')}
        </Button>
      )}
    </div>
  );
}
