// path: scripts/verify/step16-platform-brand.ts
// The platform brand: the built-in brand is valid, markup and unknown keys are refused, the logo is a media id, and the
// sanitizer reports markup that platform staff write without changing the cleaned copy.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-platform-brand.ts
import assert from 'node:assert/strict';
import { DEFAULT_PLATFORM_BRAND, logoUrl, platformBrandSchema } from '@/lib/brand/platform';
import { detectInjectionDeep, sanitize } from '@/lib/security/sanitizer';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

check('the built-in brand is valid and has no logo', () => {
  assert.equal(platformBrandSchema.safeParse(DEFAULT_PLATFORM_BRAND).success, true);
  assert.equal(logoUrl(DEFAULT_PLATFORM_BRAND), null);
});
check('markup in a brand field is refused', () => {
  assert.equal(
    platformBrandSchema.safeParse({ ...DEFAULT_PLATFORM_BRAND, tagline: '<b>x</b>' }).success,
    false,
  );
});
check('an unknown key and an empty name are refused', () => {
  assert.equal(
    platformBrandSchema.safeParse({ ...DEFAULT_PLATFORM_BRAND, extra: 'x' }).success,
    false,
  );
  assert.equal(
    platformBrandSchema.safeParse({ ...DEFAULT_PLATFORM_BRAND, name: '' }).success,
    false,
  );
});
check('a logo is a media id and gives a media address', () => {
  const id = '0190c4a2-7b7e-7c8e-9a52-3f0d2a1b4c5d';
  const brand = platformBrandSchema.parse({ ...DEFAULT_PLATFORM_BRAND, logoMediaId: id });
  assert.equal(logoUrl(brand), `/api/cms/media/${id}`);
  assert.equal(
    platformBrandSchema.safeParse({ ...DEFAULT_PLATFORM_BRAND, logoMediaId: 'x' }).success,
    false,
  );
});
check('markup is detected and the cleaned copy keeps the text', () => {
  const body = { html: '<p onclick="x()">Hello</p>' };
  assert.equal(detectInjectionDeep(body), 'xss_attempt');
  assert.equal(sanitize(body).html, body.html);
});

process.stdout.write(`step16-platform-brand: ${checks} checks passed\n`);
