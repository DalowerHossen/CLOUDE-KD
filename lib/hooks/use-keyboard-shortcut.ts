// path: lib/hooks/use-keyboard-shortcut.ts
'use client';

import { useEffect } from 'react';

export interface ShortcutOptions {
  /** Requires Ctrl on Windows and Linux, Cmd on macOS. */
  mod?: boolean;
  shift?: boolean;
  /** Fire even when focus is inside an input. */
  allowInInput?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useKeyboardShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions = {},
): void {
  const { mod = false, shift = false, allowInInput = false } = options;
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (mod !== (event.ctrlKey || event.metaKey)) return;
      if (shift !== event.shiftKey) return;
      if (!allowInInput && isTypingTarget(event.target)) return;
      handler(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [key, handler, mod, shift, allowInInput]);
}
