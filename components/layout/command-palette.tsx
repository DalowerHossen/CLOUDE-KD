// path: components/layout/command-palette.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Keyboard } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { NavItem } from '@/config/nav-types';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { t, type StringKey } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui-store';
import { NavIconView } from './icon-map';

/** Ctrl+K / Cmd+K palette: jump to any page the user may see, or open the shortcut list. */
export function CommandPalette({ items }: { items: readonly NavItem[] }): JSX.Element {
  const router = useRouter();
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  const toggle = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      setOpen(!useUiStore.getState().commandOpen);
    },
    [setOpen],
  );
  useKeyboardShortcut('k', toggle, { mod: true, allowInInput: true });

  const go = (href: string): void => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('s01Core.nav.commandPalette')}
      description={t('s01Core.nav.commandHint')}
    >
      <CommandInput placeholder={t('s01Core.nav.commandPlaceholder')} />
      <CommandList>
        <CommandEmpty>{t('s01Core.nav.commandEmpty')}</CommandEmpty>
        <CommandGroup heading={t('s01Core.nav.dashboard')}>
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${t(item.labelKey as StringKey)} ${item.href}`}
              onSelect={() => go(item.href)}
            >
              <NavIconView name={item.icon} className="h-4 w-4" />
              {t(item.labelKey as StringKey)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t('s01Core.nav.help')}>
          <CommandItem
            value={t('s01Core.shortcuts.title')}
            onSelect={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
          >
            <Keyboard className="h-4 w-4" aria-hidden="true" />
            {t('s01Core.shortcuts.title')}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
