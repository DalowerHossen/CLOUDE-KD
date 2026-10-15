// path: scripts/check-dead-links.mjs
// Dead-link guard: every internal href in navigation fragments and in source must resolve to an app route.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GUARD_ROOT ?? path.resolve(here, '..');
const strict = process.argv.includes('--strict');
const plannedFile = path.join(root, 'config', 'planned-routes.json');
const planned =
  !strict && fs.existsSync(plannedFile)
    ? Object.keys(JSON.parse(fs.readFileSync(plannedFile, 'utf8')).routes ?? {})
    : [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

// Collect routes from app/**/page.tsx and app/**/route.ts (group folders in parentheses and private folders are not URL segments).
const appDir = path.join(root, 'app');
const routes = [];
for (const f of walk(appDir)) {
  const rel = path.relative(appDir, f).split(path.sep);
  const file = rel.pop();
  if (!/^(page\.tsx|route\.ts)$/.test(file)) continue;
  const segs = rel.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('_') && !s.startsWith('@'));
  routes.push(segs);
}
const staticRoutes = new Set(['/api']);
function matches(urlSegs) {
  return routes.some((r) => {
    let i = 0;
    for (const seg of r) {
      if (/^\[\[\.\.\..+\]\]$/.test(seg)) return true;
      if (/^\[\.\.\..+\]$/.test(seg)) return urlSegs.length > i;
      if (i >= urlSegs.length) return false;
      if (!/^\[.+\]$/.test(seg) && seg !== urlSegs[i]) return false;
      i++;
    }
    return i === urlSegs.length;
  });
}

const errors = [];
const hrefRe = /(?:href|to|path)\s*[:=]\s*\{?\s*['"`](\/[^'"`?#\s$]*)/g;
const files = [
  ...walk(path.join(root, 'config')),
  ...walk(path.join(root, 'app')),
  ...walk(path.join(root, 'components')),
].filter((f) => /\.(ts|tsx)$/.test(f));
let checked = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(hrefRe)) {
    const href = m[1];
    if (planned.includes(href)) continue;
    if (href === '/') {
      if (!matches([])) errors.push(`${path.relative(root, f)}: link "/" has no page`);
      checked++;
      continue;
    }
    if (href.startsWith('/api/') || staticRoutes.has(href)) continue;
    if (/^\/(favicon|apple-touch|manifest|robots|sitemap|design-tokens|icons|images)/.test(href))
      continue;
    checked++;
    const segs = href.split('/').filter(Boolean);
    if (!matches(segs))
      errors.push(`${path.relative(root, f)}: link "${href}" has no matching page`);
  }
}
if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`FAIL [dead-links]: ${e}\n`);
  process.stderr.write('RESULT [dead-links]: FAILED\n');
  process.exit(1);
}
process.stdout.write(`RESULT [dead-links]: ok (${checked} links, ${routes.length} routes)\n`);
