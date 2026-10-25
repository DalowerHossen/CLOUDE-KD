// path: lib/branding/theme.ts
// Pure brand helpers (no database, safe to import anywhere): colour maths, the contrast rules, the safe font list and the
// CSS variables a branded page sets. Branded pages always draw in the light theme, so the colours a tenant chose keep the
// contrast that was checked when they were saved.
import type { FONT_KEYS } from '@/lib/company/sections';

export type FontKey = (typeof FONT_KEYS)[number];

/** Only these font stacks exist; nothing is loaded from the internet. */
export const FONT_STACKS: Readonly<Record<FontKey, string>> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  inter: 'Inter, ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** WCAG 2.1 minimum for normal text; used for the primary and the secondary colour (white text on a button). */
export const MIN_TEXT_CONTRAST = 4.5;
/** WCAG 2.1 minimum for large text and interface parts; used for the accent colour. */
export const MIN_UI_CONTRAST = 3;

const WHITE = '#ffffff';
const DARK_TEXT = '#0f172a';

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** "#1d4ed8" becomes "224 76% 48%", the form the design tokens use. */
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** The text colour (as a token triplet) that reads best on the given colour. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, DARK_TEXT) ? '0 0% 100%' : '222 47% 8%';
}

export interface BrandColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface ColorIssue {
  field: keyof BrandColors;
  message: string;
}

/** The accessibility check: each colour must be readable on white (text) or visible on white (interface part). */
export function checkBrandColors(colors: BrandColors): ColorIssue[] {
  const issues: ColorIssue[] = [];
  const rules: ReadonlyArray<readonly [keyof BrandColors, number, string]> = [
    ['primaryColor', MIN_TEXT_CONTRAST, 'Primary colour'],
    ['secondaryColor', MIN_TEXT_CONTRAST, 'Secondary colour'],
    ['accentColor', MIN_UI_CONTRAST, 'Accent colour'],
  ];
  for (const [field, minimum, label] of rules) {
    const value = colors[field];
    if (!isHexColor(value)) {
      issues.push({ field, message: `${label} must be a six digit hex value such as #1d4ed8.` });
      continue;
    }
    const ratio = contrastRatio(value, WHITE);
    if (ratio < minimum)
      issues.push({
        field,
        message: `${label} is too light: its contrast with white is ${ratio.toFixed(2)} and ${minimum} is needed.`,
      });
  }
  return issues;
}

export interface BrandTheme extends BrandColors {
  fontKey: FontKey;
}

/** CSS custom properties for the branded wrapper: brand colours, and the light neutrals so the checked contrast holds. */
export function themeCssVars(theme: BrandTheme): Record<string, string> {
  return {
    '--primary': hexToHslTriplet(theme.primaryColor),
    '--primary-foreground': readableOn(theme.primaryColor),
    '--ring': hexToHslTriplet(theme.primaryColor),
    '--brand-secondary': hexToHslTriplet(theme.secondaryColor),
    '--brand-secondary-foreground': readableOn(theme.secondaryColor),
    '--brand-accent': hexToHslTriplet(theme.accentColor),
    '--background': '0 0% 100%',
    '--foreground': '222 47% 11%',
    '--card': '0 0% 100%',
    '--card-foreground': '222 47% 11%',
    '--muted': '215 25% 95%',
    '--muted-foreground': '215 16% 36%',
    '--border': '215 20% 82%',
    '--input': '215 16% 52%',
    'font-family': FONT_STACKS[theme.fontKey],
    'color-scheme': 'light',
  };
}

export const DEFAULT_SECONDARY = '#334155';
