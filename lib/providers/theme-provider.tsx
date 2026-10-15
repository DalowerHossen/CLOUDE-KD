// path: lib/providers/theme-provider.tsx
'use client';

import { CONTRAST_STORAGE_KEY, THEME_STORAGE_KEY } from './theme-script';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ContrastChoice = 'normal' | 'high';

interface ThemeContextValue {
  theme: ThemeChoice;
  contrast: ContrastChoice;
  resolvedTheme: 'light' | 'dark';
  setTheme: (value: ThemeChoice) => void;
  setContrast: (value: ContrastChoice) => void;
}

const THEME_KEY = THEME_STORAGE_KEY;
const CONTRAST_KEY = CONTRAST_STORAGE_KEY;

const ThemeContext = createContext<ThemeContextValue | null>(null);

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
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme: ThemeChoice, contrast: ContrastChoice): 'light' | 'dark' {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  if (contrast === 'high') root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
  root.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  const [contrast, setContrastState] = useState<ContrastChoice>('normal');
  const [resolvedTheme, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const storedTheme = readStored<ThemeChoice>(THEME_KEY, ['light', 'dark', 'system'], 'system');
    const storedContrast = readStored<ContrastChoice>(CONTRAST_KEY, ['normal', 'high'], 'normal');
    setThemeState(storedTheme);
    setContrastState(storedContrast);
    setResolved(apply(storedTheme, storedContrast));
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const list = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (): void => setResolved(apply('system', contrast));
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }, [theme, contrast]);

  const setTheme = useCallback(
    (value: ThemeChoice) => {
      writeStored(THEME_KEY, value);
      setThemeState(value);
      setResolved(apply(value, contrast));
    },
    [contrast],
  );
  const setContrast = useCallback(
    (value: ContrastChoice) => {
      writeStored(CONTRAST_KEY, value);
      setContrastState(value);
      setResolved(apply(theme, value));
    },
    [theme],
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
