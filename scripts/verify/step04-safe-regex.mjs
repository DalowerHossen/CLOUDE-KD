// path: scripts/verify/step04-safe-regex.mjs
// ReDoS guard: every regular expression literal in source files must pass the safe-regex check.
// Usage: node scripts/verify/step04-safe-regex.mjs   (exit 1 on a risky expression that is not in the reviewed list)
// Expressions that safe-regex flags only because of its strict star-height rule, and that were reviewed as linear
// (anchored, disjoint separators or bounded counts), are listed in step04-safe-regex-allow.json with the reason.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const safe = require('safe-regex');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GUARD_ROOT ?? path.resolve(here, '..', '..');
const allowFile = path.join(here, 'step04-safe-regex-allow.json');
const allowed = new Set(
  (fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')).reviewed : []).map(
    (e) => e.expression,
  ),
);
const SKIP = new Set(['node_modules', '.next', '.git', 'docs', 'public', 'supabase']);
const LITERAL =
  /(?:^|[=(,:;!&|?{}\[\s])\/((?![*\/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n\[])+)\/([dgimsuvy]*)(?=\s*[.,;)\]}]|\s*$)/gm;
const errors = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) scan(full);
  }
}

function scan(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const m of line.matchAll(LITERAL)) {
      try {
        new RegExp(m[1], m[2]);
      } catch {
        continue;
      }
      if (!safe(new RegExp(m[1], m[2]), { limit: 25 }) && !allowed.has(m[1])) {
        errors.push(`${path.relative(root, file)}:${i + 1}: risky regular expression /${m[1]}/`);
      }
    }
  });
}

walk(root);
if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`FAIL [safe-regex]: ${e}\n`);
  process.stderr.write('RESULT [safe-regex]: FAILED\n');
  process.exit(1);
}
process.stdout.write('RESULT [safe-regex]: ok\n');
