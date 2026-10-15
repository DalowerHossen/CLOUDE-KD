// path: scripts/verify/step01-tokens.mjs
// Checks WCAG contrast of text color pairs in every theme and that motion constants match the design tokens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'config/design-tokens.json'), 'utf8'));

function hslToRgb(text) {
  const [h, s, l] = text.replace(/%/g, '').split(/\s+/).map(Number);
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  ['background', 'foreground', 4.5],
  ['card', 'card-foreground', 4.5],
  ['popover', 'popover-foreground', 4.5],
  ['primary', 'primary-foreground', 4.5],
  ['secondary', 'secondary-foreground', 4.5],
  ['muted', 'muted-foreground', 4.5],
  ['accent', 'accent-foreground', 4.5],
  ['destructive', 'destructive-foreground', 4.5],
  ['success', 'success-foreground', 4.5],
  ['warning', 'warning-foreground', 4.5],
  ['info', 'info-foreground', 4.5],
  ['background', 'muted-foreground', 4.5],
  ['background', 'primary', 4.5],
  ['background', 'ring', 3],
  ['background', 'input', 3],
];
let failed = 0;
for (const [theme, colors] of Object.entries(tokens.colors)) {
  for (const [bg, fg, min] of PAIRS) {
    const r = ratio(colors[bg], colors[fg]);
    if (r < min) {
      failed++;
      process.stdout.write(`FAIL  ${theme}: ${bg} / ${fg} contrast ${r.toFixed(2)} < ${min}\n`);
    }
  }
}
// Motion constants in lib/utils/motion.ts must equal the CSS tokens (ms to seconds).
const motionSource = fs.readFileSync(path.join(root, 'lib/utils/motion.ts'), 'utf8');
for (const [name, value] of Object.entries(tokens.motion.duration)) {
  const seconds = Number.parseInt(value, 10) / 1000;
  if (!new RegExp(`${name}: ${seconds}\\b`).test(motionSource)) {
    failed++;
    process.stdout.write(
      `FAIL  motion duration ${name} (${value}) is not mirrored in lib/utils/motion.ts\n`,
    );
  }
}
for (const [name, value] of Object.entries(tokens.motion.easing)) {
  const numbers = value.match(/[\d.]+/g).join(', ');
  if (!motionSource.includes(`${name}: [${numbers}]`)) {
    failed++;
    process.stdout.write(`FAIL  motion easing ${name} is not mirrored in lib/utils/motion.ts\n`);
  }
}
// Spacing scale must be exactly 4/8/12/16/24/32/48/64.
const spacing = Object.keys(tokens.spacing).join(',');
if (spacing !== '4,8,12,16,24,32,48,64') {
  failed++;
  process.stdout.write(`FAIL  spacing scale is ${spacing}\n`);
}
process.stdout.write(
  failed === 0
    ? 'step01-tokens: ok (contrast, motion parity, spacing scale)\n'
    : `step01-tokens: ${failed} problem(s)\n`,
);
process.exit(failed === 0 ? 0 : 1);
