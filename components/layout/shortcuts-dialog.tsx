// path: components/layout/shortcuts-dialog.tsx
'use client';

import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { t } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui-store';

const ROWS: ReadonlyArray<{
  keys: string;
  labelKey:
    | 's01Core.shortcuts.openPalette'
    | 's01Core.shortcuts.openShortcuts'
    | 's01Core.shortcuts.closeDialog';
}> = [
  { keys: 'Ctrl / Cmd + K', labelKey: 's01Core.shortcuts.openPalette' },
  { keys: '?', labelKey: 's01Core.shortcuts.openShortcuts' },
  { keys: 'Esc', labelKey: 's01Core.shortcuts.closeDialog' },
];

/** Keyboard shortcut reference, opened with the ? key. */
export function ShortcutsDialog(): JSX.Element {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const show = useCallback(() => setOpen(true), [setOpen]);
  useKeyboardShortcut('?', show, { shift: true });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('s01Core.shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('s01Core.nav.commandHint')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.keys} className="flex items-center justify-between gap-4">
              <dt className="text-base">{t(row.labelKey)}</dt>
              <dd>
                <kbd className="rounded-sm border bg-muted px-2 py-1 font-mono text-caption">
                  {row.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
