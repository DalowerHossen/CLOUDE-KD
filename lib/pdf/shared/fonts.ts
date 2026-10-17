// path: lib/pdf/shared/fonts.ts
// Fonts of PDF documents. The built-in Helvetica needs no file but covers Western European text only. When a folder
// with regular.ttf and bold.ttf is given (PDF_FONT_DIR) a Unicode font is embedded; the PDF library keeps only the
// glyphs that are used (font subsetting).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';

export interface PdfFonts {
  regular: string;
  bold: string;
  unicode: boolean;
}

const BUILT_IN: PdfFonts = { regular: 'Helvetica', bold: 'Helvetica-Bold', unicode: false };
let current: PdfFonts = BUILT_IN;
let registeredFor: string | null = null;

/** Registers the Unicode font once for the folder; falls back to Helvetica when the files are not there. */
export function setupFonts(dir: string | undefined): PdfFonts {
  if (!dir) return (current = BUILT_IN);
  if (registeredFor === dir) return current;
  const regular = join(dir, 'regular.ttf');
  const bold = join(dir, 'bold.ttf');
  if (!existsSync(regular) || !existsSync(bold)) return (current = BUILT_IN);
  Font.register({
    family: 'KDSans',
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: bold, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registeredFor = dir;
  current = { regular: 'KDSans', bold: 'KDSans', unicode: true };
  return current;
}

export function fonts(): PdfFonts {
  return current;
}

/** Characters the built-in font can draw: Basic Latin, Latin-1 and the euro sign. */
const WIN_ANSI = /^[\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff\u20ac]$/;

/** Text safe to draw with the current font: with Helvetica other characters become "?" instead of broken glyphs. */
export function safeText(text: string, f: PdfFonts = current): string {
  if (f.unicode) return text;
  let out = '';
  for (const ch of text) out += WIN_ANSI.test(ch) ? ch : '?';
  return out;
}
