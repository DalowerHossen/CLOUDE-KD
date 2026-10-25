// path: scripts/verify/step16-module-routes.ts
// A company API route of an optional module must refuse a company whose module is off. Routes built with withApi do it
// there; the plain handlers (files and exports) must call assertApiModuleEnabled themselves or use exportResponse, which does.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-module-routes.ts
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { moduleForApi } from '@/config/features';

/** Public short links that are opened by strangers and carry no company session: nothing to gate. */
const PUBLIC_BY_DESIGN: readonly string[] = ['app/api/social/l/[code]/route.ts'];

const files = execSync("git ls-files 'app/api/**/route.ts'", { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let checked = 0;
const missing: string[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('withApi(')) continue;
  const path =
    '/' +
    file
      .replace(/^app\//, '')
      .replace(/\/route\.ts$/, '')
      .replace(/\[[^\]]+\]/g, 'x');
  if (!moduleForApi(path) || PUBLIC_BY_DESIGN.includes(file)) continue;
  checked += 1;
  if (!source.includes('assertApiModuleEnabled') && !source.includes('exportResponse('))
    missing.push(file);
}
assert.deepEqual(
  missing,
  [],
  `plain routes of optional modules without a module check:\n${missing.join('\n')}`,
);
assert.ok(
  readFileSync('services/budget/export-response.ts', 'utf8').includes('assertApiModuleEnabled'),
);
assert.ok(checked >= 20, 'the route scan found too few routes');
process.stdout.write(`step16-module-routes: ${checked} plain routes checked\n`);
