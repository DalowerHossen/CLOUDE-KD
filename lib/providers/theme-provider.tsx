// path: lib/providers/theme-provider.tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CONTRAST_STORAGE_KEY, THEME_STORAGE_KEY } from './theme-script';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ContrastChoice = 'normal' | 'high';

interface ThemeContextValue {
  theme: ThemeChoice;
  contrast: ContrastChoice;
  resolvedTheme: 'light' | 'dark';
  setTheme: (value: ThemeChoice) => void;
  setContrast: (value: ContrastChoice) => void;
}

const THEMES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
const CONTRASTS: readonly ContrastChoice[] = ['normal', 'high'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribeStore(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function subscribeSystem(callback: () => void): () => void {
  const list = window.matchMedia(DARK_QUERY);
  list.addEventListener('change', callback);
  return () => list.removeEventListener('change', callback);
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the choice then lasts for this page view only.
  }
  listeners.forEach((listener) => listener());
}

/** Keeps the document in step with the theme (an external system, so an effect is the right tool). */
function applyToDocument(resolved: 'light' | 'dark', contrast: ContrastChoice): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  if (contrast === 'high') root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const theme = useSyncExternalStore(
    subscribeStore,
    () => readStored<ThemeChoice>(THEME_STORAGE_KEY, THEMES, 'system'),
    () => 'system' as ThemeChoice,
  );
  const contrast = useSyncExternalStore(
    subscribeStore,
    () => readStored<ContrastChoice>(CONTRAST_STORAGE_KEY, CONTRASTS, 'normal'),
    () => 'normal' as ContrastChoice,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    applyToDocument(resolvedTheme, contrast);
  }, [resolvedTheme, contrast]);

  const setTheme = useCallback((value: ThemeChoice) => writeStored(THEME_STORAGE_KEY, value), []);
  const setContrast = useCallback(
    (value: ContrastChoice) => writeStored(CONTRAST_STORAGE_KEY, value),
    [],
  );

  const value = useMemo(
    () => ({ theme, contrast, resolvedTheme, setTheme, setContrast }),
    [theme, contrast, resolvedTheme, setTheme, setContrast],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
