// path: scripts/verify/step04-static.mjs
// Static security scan of the source tree. Fails when a dangerous pattern appears outside its allowed place.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.next', '.git', 'coverage', 'backups']);
const SOURCE = /\.(ts|tsx|mjs|js)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE.test(name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((f) => ({
  path: relative(ROOT, f).replaceAll('\\', '/'),
  text: readFileSync(f, 'utf8'),
}));
const problems = [];
const fail = (path, message) => problems.push(`${path}: ${message}`);

const APP_CODE = /^(app|components|lib|services|stores|config|cron|workers|emails|proxy\.ts)/;
const SCAN_SELF = /^scripts\//;
const DANGEROUS_INNER_HTML = new Set([
  'components/shared/safe-html.tsx',
  'components/shared/theme-init-script.tsx',
  // JSON-LD data block; the text is JSON escaped by toScriptText (STEP 06).
  'components/marketing/json-ld.tsx',
]);
// Routes that are intentionally plain handlers: probes that must not depend on any other service.
// Whole folders of routes called by mail clients and providers: image, redirect, one-click and signed callbacks.
const PLAIN_PREFIXES = [
  'app/api/cms/media/[id]/',
  'app/api/seo/og/',
  'app/api/email/track/',
  'app/api/email/unsubscribe/',
  'app/api/email/webhooks/',
];
const PLAIN_ROUTES = new Set([
  'app/api/storage/drive/callback/route.ts',
  'app/api/storage/download/[token]/route.ts',
  'app/api/health/route.ts',
  'app/api/health/ready/route.ts',
]);

for (const { path, text } of files) {
  if (SCAN_SELF.test(path)) continue;
  if (APP_CODE.test(path)) {
    if (/\beval\s*\(/.test(text)) fail(path, 'eval is not allowed');
    if (/new\s+Function\s*\(/.test(text)) fail(path, 'new Function is not allowed');
    if (/document\.write\s*\(/.test(text)) fail(path, 'document.write is not allowed');
    if (/\.innerHTML\s*=/.test(text)) fail(path, 'innerHTML assignment is not allowed');
    if (text.includes('dangerouslySetInnerHTML') && !DANGEROUS_INNER_HTML.has(path))
      fail(path, 'dangerouslySetInnerHTML outside the sanitizing component');
    if (/child_process/.test(text) && !path.startsWith('scripts/'))
      fail(path, 'child_process in application code');
    if (/['"]use client['"]/.test(text.split('\n').slice(0, 5).join('\n'))) {
      if (/getAdminSupabase|SUPABASE_SERVICE_ROLE_KEY|\.rpc\(\s*['"]kd_/.test(text))
        fail(path, 'client component reaches privileged database access');
      if (
        /from\s+['"]server-only['"]|^import\s+(?!type\b)[^;]*from\s+['"]@\/services\//m.test(text)
      )
        fail(path, 'client component imports server code');
    }
  }
  if (
    /^app\/api\/.+\/route\.ts$/.test(path) &&
    !PLAIN_ROUTES.has(path) &&
    !PLAIN_PREFIXES.some((p) => path.startsWith(p))
  ) {
    // Route builders (for example buildApprovalRoutes) create their handlers with withApi.
    if (!text.includes('withApi(') && !/\bbuild\w+Routes\(|soloModeRoute/.test(text))
      fail(path, 'API route does not use withApi');
  }
}

const csp = files.find((f) => f.path === 'lib/security/csp.ts');
if (!csp) fail('lib/security/csp.ts', 'missing');
else {
  const scriptLines = csp.text.split('\n').filter((l) => l.includes('script-src'));
  for (const l of scriptLines)
    if (/unsafe-inline|unsafe-eval/.test(l))
      fail('lib/security/csp.ts', 'script-src allows unsafe code');
}

const proxy = files.find((f) => f.path === 'proxy.ts');
if (!proxy || !/nonce/i.test(proxy.text))
  fail('proxy.ts', 'the request proxy must create a CSP nonce');

if (problems.length > 0) {
  process.stderr.write(`FAIL step04-static\n${problems.map((p) => `  ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`ok    step04-static (${files.length} files scanned)\n`);
