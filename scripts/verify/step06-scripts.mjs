// path: scripts/verify/step06-scripts.mjs
// Static proof that tracking scripts can start only on public pages and only after consent.
// Run: node scripts/verify/step06-scripts.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROVIDER_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'snap.licdn.com',
  'static.ads-twitter.com',
  'clarity.ms',
  's.pinimg.com',
];
const ALLOWED_HOST_FILES = new Set([
  'lib/analytics/providers.ts',
  'lib/analytics/start-provider.ts',
  'services/analytics/pixels.ts',
]);
const SENSITIVE = ['app/(auth)', 'app/(client-portal)', 'app/(dashboard)', 'app/(admin)'];
const LOADER_USERS = new Set([
  'components/marketing/public-frame.tsx',
  'components/marketing/tracking-loader.tsx',
  'components/marketing/contact-form.tsx',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.git')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

const failures = [];
const fail = (message) => failures.push(message);
const files = ['app', 'components', 'lib', 'services', 'config'].flatMap((d) => walk(d));

for (const path of files) {
  const text = readFileSync(path, 'utf8');
  if (path.startsWith('scripts/')) continue;
  const sensitive = SENSITIVE.some((s) => path.startsWith(s));
  if (/tracking-loader|start-provider|lib\/analytics\/providers/.test(text)) {
    if (sensitive && /tracking-loader|start-provider/.test(text))
      fail(`${path}: tracking code is used inside a protected area`);
    const marketing =
      path.startsWith('app/(public)') || path.startsWith('app/(admin)/admin/analytics');
    const lib =
      path.startsWith('lib/analytics/') ||
      path.startsWith('services/analytics/') ||
      path.startsWith('services/marketing/') ||
      path.startsWith('lib/marketing/') ||
      path.startsWith('app/api/');
    if (!marketing && !lib && !LOADER_USERS.has(path) && !path.startsWith('components/marketing/'))
      fail(`${path}: tracking code is used outside the public site`);
  }
  if (!ALLOWED_HOST_FILES.has(path)) {
    for (const host of PROVIDER_HOSTS)
      if (text.includes(host) && !path.startsWith('config/') && !path.startsWith('docs/'))
        fail(`${path}: provider address ${host} outside the provider list`);
  }
}

const loader = readFileSync('components/marketing/tracking-loader.tsx', 'utf8');
for (const needle of [
  'consentFromCookieString',
  'activeProviders(',
  'PRIVATE_PREFIXES',
  'isPrivate',
])
  if (!loader.includes(needle)) fail(`tracking-loader.tsx: missing ${needle}`);
if (!/startProvider\(/.test(loader)) fail('tracking-loader.tsx never starts a provider');
if (loader.indexOf('activeProviders(') > loader.indexOf('startProvider('))
  fail('providers start before consent is read');

const frame = readFileSync('components/marketing/public-frame.tsx', 'utf8');
if (!frame.includes('TrackingLoader')) fail('public-frame.tsx does not mount the loader');
for (const group of SENSITIVE) {
  for (const f of walk(group)) {
    const text = readFileSync(f, 'utf8');
    if (/PublicFrame|TrackingLoader/.test(text))
      fail(`${f}: the public frame must not be used here`);
  }
}
const publicLayout = readFileSync('app/(public)/layout.tsx', 'utf8');
if (!publicLayout.includes('PublicFrame')) fail('app/(public)/layout.tsx does not use PublicFrame');

if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`FAIL  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`ok step06-scripts (${files.length} files scanned)\n`);
