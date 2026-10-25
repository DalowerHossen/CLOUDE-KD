// path: scripts/verify/step16-kyc-owner.ts
// Checks of the owner verification screen helpers: the photo size rule and the list of countries.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-kyc-owner.ts
import assert from 'node:assert/strict';
import { COUNTRY_CODES, countryName, sortedCountryCodes } from '@/lib/company/countries';
import { MAX_PDF_BYTES, MAX_SIDE, fitWithin } from '@/lib/kyc/image-prep';

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

check('a small picture is not changed', () => {
  assert.deepEqual(fitWithin(1200, 800), { width: 1200, height: 800 });
});

check('a big photo is scaled so the longest side is MAX_SIDE and the shape stays', () => {
  const out = fitWithin(4000, 3000);
  assert.equal(out.width, MAX_SIDE);
  assert.equal(out.height, 1500);
  const tall = fitWithin(3000, 4000);
  assert.equal(tall.height, MAX_SIDE);
  assert.equal(tall.width, 1500);
});

check('the PDF limit leaves room for base64 inside a 6 MB request', () => {
  assert.ok(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 2000 < 6_000_000);
});

check('every country and territory of ISO 3166-1 is offered once, with a real name', () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  for (const c of COUNTRY_CODES) {
    assert.match(c, /^[A-Z]{2}$/);
    assert.notEqual(countryName(c), c, `no name for ${c}`);
  }
  for (const c of ['BD', 'IN', 'PK', 'US', 'GB', 'AE', 'SG', 'NP', 'LK', 'AF'])
    assert.ok(COUNTRY_CODES.includes(c), c);
});

check('the drop-down order is by country name', () => {
  assert.equal(sortedCountryCodes.length, 249);
  const names = sortedCountryCodes.map(countryName);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(names, sorted);
});

process.stdout.write(`step16-kyc-owner: ${checks} checks passed\n`);
