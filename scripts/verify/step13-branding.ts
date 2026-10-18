// path: scripts/verify/step13-branding.ts
// Logic checks of tenant branding (13.5) that need no database or network: contrast maths and rules, colour conversion,
// the safe font list, the CSS variables of a branded page, and the strict save, import and export shapes.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-branding.ts
import assert from 'node:assert/strict';
import { FONT_KEYS } from '@/lib/company/sections';
import {
  brandingFileSchema,
  brandingInputSchema,
  importBodySchema,
  saveBodySchema,
} from '@/services/branding/save';
import {
  checkBrandColors,
  contrastRatio,
  FONT_STACKS,
  hexToHslTriplet,
  readableOn,
  themeCssVars,
} from '@/services/branding/theme';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const good = {
  primaryColor: '#1d4ed8',
  secondaryColor: '#334155',
  accentColor: '#0f766e',
  fontKey: 'system',
  emailSignature: '<p>Thanks</p>',
  clientFooter: 'Acme Ltd, 1 Main Street',
} as const;

async function main(): Promise<void> {
  await check('contrast maths matches WCAG', () => {
    assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
    assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00');
    assert.ok(contrastRatio('#1d4ed8', '#ffffff') >= 4.5);
  });

  await check('light colours are refused, dark ones pass', () => {
    assert.deepEqual(checkBrandColors(good), []);
    const issues = checkBrandColors({ ...good, primaryColor: '#ffeb3b', accentColor: '#fffde7' });
    assert.deepEqual(issues.map((i) => i.field).sort(), ['accentColor', 'primaryColor']);
    assert.equal(checkBrandColors({ ...good, secondaryColor: 'red' }).length, 1);
  });

  await check('hex converts to the token form and picks readable text', () => {
    assert.equal(hexToHslTriplet('#ffffff'), '0 0% 100%');
    assert.equal(hexToHslTriplet('#000000'), '0 0% 0%');
    assert.match(hexToHslTriplet('#1d4ed8'), /^22\d 7\d% 4\d%$/);
    assert.equal(readableOn('#1d4ed8'), '0 0% 100%');
    assert.equal(readableOn('#ffeb3b'), '222 47% 8%');
  });

  await check('only the four safe fonts exist and none loads anything', () => {
    assert.deepEqual(Object.keys(FONT_STACKS).sort(), [...FONT_KEYS].sort());
    for (const stack of Object.values(FONT_STACKS)) assert.ok(!/url\(|http|;/.test(stack));
  });

  await check('a branded page is light and carries the brand colours', () => {
    const vars = themeCssVars({ ...good, fontKey: 'inter' });
    assert.equal(vars['color-scheme'], 'light');
    assert.equal(vars['--background'], '0 0% 100%');
    assert.equal(vars['--primary'], hexToHslTriplet('#1d4ed8'));
    assert.equal(vars['--primary-foreground'], '0 0% 100%');
    assert.equal(vars['font-family'], FONT_STACKS.inter);
  });

  await check('save, import and export shapes are strict', () => {
    assert.ok(brandingInputSchema.safeParse(good).success);
    assert.ok(!brandingInputSchema.safeParse({ ...good, extra: 1 }).success);
    assert.ok(!brandingInputSchema.safeParse({ ...good, fontKey: 'comic' }).success);
    assert.ok(!brandingInputSchema.safeParse({ ...good, primaryColor: 'blue' }).success);
    assert.ok(!brandingInputSchema.safeParse({ ...good, clientFooter: '<script>' }).success);
    assert.ok(saveBodySchema.safeParse({ expectedVersion: 0, brand: good }).success);
    const file = { kind: 'kd-branding', version: 1, brand: good };
    assert.ok(brandingFileSchema.safeParse(file).success);
    assert.ok(!brandingFileSchema.safeParse({ ...file, version: 2 }).success);
    assert.ok(importBodySchema.safeParse({ expectedVersion: 3, file }).success);
    assert.ok(
      !importBodySchema.safeParse({ expectedVersion: 3, file: { ...file, kind: 'x' } }).success,
    );
  });

  process.stdout.write(`step13-branding: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
