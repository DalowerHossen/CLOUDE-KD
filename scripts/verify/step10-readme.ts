// path: scripts/verify/step10-readme.ts
// Writes docs/processors/README.md from config/processors.ts and the adapter files present in code.
// Run: npx tsx scripts/verify/step10-readme.ts   (add --check to fail when the file is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { PROCESSORS } from '@/config/processors';

const root = process.cwd();
const adaptersDir = path.join(root, 'lib/payment/adapters');
const present = new Set(
  fs
    .readdirSync(adaptersDir)
    .filter((n) => /^[a-z]+\.ts$/.test(n) && n !== 'base.ts')
    .map((n) => n.replace(/\.ts$/, '')),
);

const rows = PROCESSORS.map((p) => {
  const doc = fs.existsSync(path.join(root, 'docs/processors', `${p.id}.md`))
    ? `[${p.id}.md](${p.id}.md)`
    : 'not written yet';
  const verify = fs.existsSync(path.join(root, 'docs/processors', `${p.id}.verify.md`))
    ? `[${p.id}.verify.md](${p.id}.verify.md)`
    : 'not run yet';
  return `| ${p.id} | ${p.name} | ${p.step} | ${present.has(p.id) ? 'yes' : 'no'} | ${doc} | ${verify} | ${p.docsUrl} |`;
});

const text = [
  '<!-- GENERATED - do not edit. Source: config/processors.ts (run: npx tsx scripts/verify/step10-readme.ts) -->',
  '# Payment processors',
  '',
  'The dashboard lists only processors whose adapter file is present in `lib/payment/adapters`.',
  '',
  '| id | Name | STEP | Adapter in code | Documentation record | Verification record | Provider documentation |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
].join('\n');

const target = path.join(root, 'docs/processors/README.md');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== text) {
    process.stderr.write('docs/processors/README.md is out of date\n');
    process.exit(1);
  }
} else {
  fs.writeFileSync(target, text);
}
