// path: scripts/gen.mjs
// Generates barrels from fragment files so STEPs never edit shared files.
//   node scripts/gen.mjs           writes generated files
//   node scripts/gen.mjs --check   fails when a generated file is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GUARD_ROOT ?? path.resolve(here, '..');
const checkOnly = process.argv.includes('--check');

const PROCESSOR_IDS = ['stripe', 'nmi', 'adyen', 'verifone', 'braintree', 'bluesnap', 'square', 'payoneer', 'fastspring', 'paddle', 'payproglobal', 'paypal', 'payarc', 'rapyd', 'authorizenet', 'custom'];

const outputs = new Map();
const emit = (relPath, content) => outputs.set(relPath, content);

function list(dir, test) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && test(e.name))
    .map((e) => e.name)
    .sort();
}
const base = (file) => file.replace(/\.[^.]+$/, '');
const camel = (name) => name.replace(/[-_.]+([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
const header = (rel, source) => `// path: ${rel}\n// GENERATED - do not edit. Source: ${source} (run: npm run gen)\n`;
const relImport = (fromRel, toRel) => {
  let r = path.posix.relative(path.posix.dirname(fromRel), toRel).replace(/\.tsx?$/, '');
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
};

/** Barrel that imports one named export from each fragment file. */
function arrayBarrel({ out, dir, filePattern, exportName, typeImport, typeName, constName }) {
  const files = list(dir, (n) => filePattern.test(n));
  const lines = [header(out, `${dir}/*`)];
  if (typeImport) lines.push(typeImport);
  files.forEach((f) => lines.push(`import { ${exportName} as ${camel(base(f))} } from '${relImport(out, `${dir}/${base(f)}`)}';`));
  lines.push('');
  lines.push(`export const ${constName}: ${typeName}[] = [${files.map((f) => `...${camel(base(f))}`).join(', ')}];`);
  lines.push('');
  emit(out, lines.join('\n'));
}

// 1. UI strings
{
  const out = 'lib/i18n/strings/en.ts';
  const files = list('lib/i18n/strings/en', (n) => /^s\d{2}-[a-z0-9-]+\.ts$/.test(n));
  const lines = [header(out, 'lib/i18n/strings/en/sNN-*.ts')];
  files.forEach((f) => lines.push(`import { strings as ${camel(base(f))} } from './en/${base(f)}';`));
  lines.push('');
  lines.push(`export const en = { ${files.map((f) => camel(base(f))).join(', ')} } as const;`);
  lines.push('');
  lines.push('export type Strings = typeof en;');
  lines.push('');
  emit(out, lines.join('\n'));
}

// 2. Navigation
arrayBarrel({
  out: 'config/nav-map.ts',
  dir: 'config/nav',
  filePattern: /^s\d{2}\.ts$/,
  exportName: 'nav',
  typeImport: "import type { NavItem } from './nav-types';",
  typeName: 'NavItem',
  constName: 'navMap',
});

// 3. Permissions
arrayBarrel({
  out: 'config/permissions.ts',
  dir: 'config/permissions',
  filePattern: /^s\d{2}-[a-z0-9-]+\.ts$/,
  exportName: 'permissions',
  typeImport: "import type { PermissionDefinition } from '@/types/contracts';",
  typeName: 'PermissionDefinition',
  constName: 'permissions',
});

// 4. Approval rules
arrayBarrel({
  out: 'config/approval-rules.generated.ts',
  dir: 'config/approval',
  filePattern: /^s\d{2}-[a-z0-9-]+\.ts$/,
  exportName: 'approvalRules',
  typeImport: "import type { ApprovalRuleDefinition } from '@/types/contracts';",
  typeName: 'ApprovalRuleDefinition',
  constName: 'approvalRules',
});

// 5. Environment schemas and .env.example
{
  const server = list('lib/env', (n) => /^s\d{2}\.ts$/.test(n));
  let out = 'lib/env/schema.generated.ts';
  let lines = [header(out, 'lib/env/sNN.ts'), "import { z } from 'zod';"];
  server.forEach((f) => lines.push(`import { serverShape as ${camel(base(f))} } from './${base(f)}';`));
  lines.push('', `export const serverSchema = z.object({ ${server.map((f) => `...${camel(base(f))}`).join(', ')} });`, '');
  emit(out, lines.join('\n'));

  const pub = list('lib/env', (n) => /^s\d{2}-public\.ts$/.test(n));
  out = 'lib/env/public.generated.ts';
  lines = [header(out, 'lib/env/sNN-public.ts'), "import { z } from 'zod';"];
  pub.forEach((f) => {
    const id = camel(base(f));
    lines.push(`import { publicShape as ${id}Shape, publicRuntime as ${id}Runtime } from './${base(f)}';`);
  });
  lines.push('', `export const publicSchema = z.object({ ${pub.map((f) => `...${camel(base(f))}Shape`).join(', ')} });`);
  lines.push(`export const publicRuntime: Record<string, string | undefined> = { ${pub.map((f) => `...${camel(base(f))}Runtime`).join(', ')} };`, '');
  emit(out, lines.join('\n'));

  const frags = list('config/env', (n) => /^s\d{2}\.env\.fragment$/.test(n));
  const body = frags
    .map((f) => `# ===== ${f.slice(0, 3).toUpperCase()} =====\n${fs.readFileSync(path.join(root, 'config/env', f), 'utf8').trimEnd()}\n`)
    .join('\n');
  emit(
    '.env.example',
    `# GENERATED - do not edit. Source: config/env/sNN.env.fragment (run: npm run gen)\n# Copy to .env.local for development. Never commit real values. Use different secrets in every environment.\n\n${body}`,
  );
}

// 6. Cron schedule (each fragment exports one `job`)
{
  const out = 'cron/schedule.generated.ts';
  const files = list('cron/jobs', (n) => /^s\d{2}-[a-z0-9-]+\.ts$/.test(n));
  const lines = [header(out, 'cron/jobs/sNN-*.ts'), "import type { CronJobDefinition } from '@/types/contracts';"];
  files.forEach((f) => lines.push(`import { job as ${camel(base(f))} } from './jobs/${base(f)}';`));
  lines.push('', `export const cronJobs: CronJobDefinition[] = [${files.map((f) => camel(base(f))).join(', ')}];`, '');
  emit(out, lines.join('\n'));
}

// 7. Middleware chain (single entry per fragment)
{
  const out = 'lib/middleware/chain.generated.ts';
  const files = list('config/middleware', (n) => /^s\d{2}\.ts$/.test(n));
  const lines = [header(out, 'config/middleware/sNN.ts'), "import type { MiddlewareEntry } from '@/types/contracts';"];
  files.forEach((f) => lines.push(`import { entry as ${camel(base(f))} } from '@/config/middleware/${base(f)}';`));
  lines.push('', `const entries: MiddlewareEntry[] = [${files.map((f) => camel(base(f))).join(', ')}];`);
  lines.push('', '/** Modules in execution order (lower order runs first). */', 'export const middlewareChain: MiddlewareEntry[] = [...entries].sort((a, b) => a.order - b.order);', '');
  emit(out, lines.join('\n'));
}

// 8. Boot hooks
{
  const out = 'lib/boot.generated.ts';
  const files = list('config/boot', (n) => /^s\d{2}-[a-z0-9-]+\.ts$/.test(n));
  const lines = [header(out, 'config/boot/sNN-*.ts')];
  files.forEach((f) => lines.push(`import { boot as ${camel(base(f))} } from '@/config/boot/${base(f)}';`));
  lines.push('', '/** Runs every boot hook in file-name order (STEP number first). */', 'export async function runBootHooks(): Promise<void> {');
  files.forEach((f) => lines.push(`  await ${camel(base(f))}();`));
  lines.push('}', '');
  emit(out, lines.join('\n'));
}

// 9. Service registration
{
  const out = 'lib/bootstrap.generated.ts';
  const servicesDir = path.join(root, 'services');
  const domains = fs.existsSync(servicesDir)
    ? fs.readdirSync(servicesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(servicesDir, e.name, 'register.ts'))).map((e) => e.name).sort()
    : [];
  const lines = [header(out, 'services/*/register.ts')];
  domains.forEach((d) => lines.push(`import register_${camel(d)} from '@/services/${d}/register';`));
  lines.push('', '/** Registers every service implementation in the container. Runs after the boot hooks. */', 'export async function bootstrapServices(): Promise<void> {');
  domains.forEach((d) => lines.push(`  await register_${camel(d)}();`));
  lines.push('}', '');
  emit(out, lines.join('\n'));
}

// 10. Payment adapters index
{
  const out = 'lib/payment/adapters/index.generated.ts';
  const files = list('lib/payment/adapters', (n) => /^[a-z]+\.ts$/.test(n) && n !== 'base.ts');
  const ids = files.map(base);
  for (const id of ids) {
    if (!PROCESSOR_IDS.includes(id)) throw new Error(`lib/payment/adapters/${id}.ts is not a known processor id`);
  }
  const lines = [header(out, 'lib/payment/adapters/*.ts'), "import type { AdapterModule, ProcessorId } from '@/types/contracts';", ''];
  lines.push('/** Adapters that exist in code. The dashboard can only enable processors listed here. */');
  lines.push('export const adapterLoaders: Partial<Record<ProcessorId, () => Promise<AdapterModule>>> = {');
  ids.forEach((id) => lines.push(`  ${id}: () => import('./${id}'),`));
  lines.push('};', '');
  emit(out, lines.join('\n'));
}

// 11. Design tokens
{
  const tokens = JSON.parse(fs.readFileSync(path.join(root, 'config/design-tokens.json'), 'utf8'));
  const out = 'styles/tokens.generated.css';
  const vars = (obj, prefix) => Object.entries(obj).map(([k, v]) => `  --${prefix}-${k}: ${v};`);
  const colorVars = (obj) => Object.entries(obj).map(([k, v]) => `  --${k}: ${v};`);
  const css = [];
  css.push(`/* path: ${out} */`, '/* GENERATED - do not edit. Source: config/design-tokens.json (run: npm run gen) */', ':root {');
  css.push(...vars(tokens.spacing, 'space'), ...vars(tokens.radius, 'radius'), ...vars(tokens.shadow, 'shadow'), ...vars(tokens.zIndex, 'z'));
  css.push(...vars(tokens.motion.duration, 'duration'), ...vars(tokens.motion.easing, 'ease'));
  css.push(`  --font-sans: ${tokens.typography.fontSans};`, `  --font-mono: ${tokens.typography.fontMono};`);
  for (const [name, [size, line]] of Object.entries(tokens.typography.scale)) css.push(`  --text-${name}: ${size};`, `  --leading-${name}: ${line};`);
  css.push(...colorVars(tokens.colors.light), '}', '', '.dark {', ...colorVars(tokens.colors.dark), '}', '');
  css.push("[data-contrast='high'] {", ...colorVars(tokens.colors.highContrastLight), '}', '');
  css.push(".dark[data-contrast='high'] {", ...colorVars(tokens.colors.highContrastDark), '}', '');
  emit(out, css.join('\n'));
  emit('public/design-tokens.json', `${JSON.stringify(tokens, null, 2)}\n`);
}

// write or check
let stale = 0;
for (const [rel, content] of outputs) {
  const abs = path.join(root, rel);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (current === content) continue;
  stale++;
  if (checkOnly) {
    process.stderr.write(`FAIL [gen]: ${rel} is out of date\n`);
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    process.stdout.write(`generated ${rel}\n`);
  }
}
if (checkOnly) {
  if (stale > 0) {
    process.stderr.write('RESULT [gen]: FAILED (run: npm run gen)\n');
    process.exit(1);
  }
  process.stdout.write(`RESULT [gen]: ok (${outputs.size} generated files current)\n`);
} else {
  process.stdout.write(`gen: ${outputs.size} files checked, ${stale} written\n`);
}
