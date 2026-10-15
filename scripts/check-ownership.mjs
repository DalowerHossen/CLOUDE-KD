// path: scripts/check-ownership.mjs
// Usage: node scripts/check-ownership.mjs <step-number> [ref] [base]
//        node scripts/check-ownership.mjs <step-number> --files   (file list on stdin, one per line)
// Fails when a changed file is owned by another STEP (most specific pattern wins).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GUARD_ROOT ?? path.resolve(here, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ownership.json'), 'utf8'));

function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]*)\}/);
  if (!m) return [pattern];
  return m[1]
    .split(',')
    .flatMap((alt) =>
      expandBraces(pattern.slice(0, m.index) + alt + pattern.slice(m.index + m[0].length)),
    );
}

function toRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const rules = [];
for (const [step, def] of Object.entries(map.steps)) {
  for (const p of def.owns) {
    for (const expanded of expandBraces(p)) {
      rules.push({
        step,
        pattern: expanded,
        re: toRegex(expanded),
        score: expanded.replace(/[*?]/g, '').length,
      });
    }
  }
}
const anyStep = (map.anyStepMayCreate ?? []).flatMap(expandBraces).map(toRegex);

export function ownerOf(file) {
  let best = null;
  let tie = false;
  for (const r of rules) {
    if (!r.re.test(file)) continue;
    if (!best || r.score > best.score) {
      best = r;
      tie = false;
    } else if (r.score === best.score && r.step !== best.step) tie = true;
  }
  return { owner: best ? best.step : null, ambiguous: tie, pattern: best ? best.pattern : null };
}

const [stepArg, second, third] = process.argv.slice(2);
if (!stepArg) {
  process.stderr.write('Usage: check-ownership.mjs <step-number> [ref|--files] [base]\n');
  process.exit(2);
}
const step = String(Number(stepArg)).padStart(2, '0');
let files;
if (second === '--files') {
  files = fs
    .readFileSync(0, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
} else {
  const ref = second ?? 'HEAD';
  const base = third ?? 'origin/integration';
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const mergeBase = git(['merge-base', base, ref]).trim();
  files = git(['diff', '--name-only', '--diff-filter=ACMRD', `${mergeBase}`, ref])
    .split('\n')
    .filter(Boolean);
}

const errors = [];
for (const f of files) {
  if (anyStep.some((re) => re.test(f))) continue;
  const { owner, ambiguous, pattern } = ownerOf(f);
  if (owner === null) errors.push(`${f}: not owned by any STEP (write BLOCKERS.md)`);
  else if (ambiguous) errors.push(`${f}: ambiguous ownership (fix config/ownership.json)`);
  else if (owner !== step)
    errors.push(`${f}: owned by STEP ${owner} (pattern ${pattern}), not STEP ${step}`);
}
if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`FAIL [ownership]: ${e}\n`);
  process.stderr.write('RESULT [ownership]: FAILED\n');
  process.exit(1);
}
process.stdout.write(`RESULT [ownership]: ok (${files.length} files, STEP ${step})\n`);
