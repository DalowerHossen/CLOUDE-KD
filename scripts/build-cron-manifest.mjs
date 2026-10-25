// path: scripts/build-cron-manifest.mjs
// Writes netlify/functions/cron-jobs.generated.mts: the name and the schedule of every job in cron/jobs/*.ts, so the
// Netlify scheduled function (netlify/functions/cron-tick.mts) knows what to call without loading the application.
//   node scripts/build-cron-manifest.mjs           writes the file
//   node scripts/build-cron-manifest.mjs --check   fails when the file is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'cron/jobs');
const target = path.join(root, 'netlify/functions/cron-jobs.generated.mts');

const jobs = [];
for (const file of fs
  .readdirSync(dir)
  .filter((f) => /^s\d{2}-[a-z0-9-]+\.ts$/.test(f))
  .sort()) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const name = /name:\s*'([a-z][a-z0-9-]{1,60})'/.exec(text)?.[1];
  const schedule = /schedule:\s*'([0-9*/,\- ]+)'/.exec(text)?.[1];
  if (!name || !schedule || schedule.trim().split(/\s+/).length !== 5) {
    process.stderr.write(`cron manifest: ${file} has no readable name or five-field schedule\n`);
    process.exit(1);
  }
  jobs.push({ name, schedule: schedule.trim() });
}
const names = new Set(jobs.map((j) => j.name));
if (names.size !== jobs.length) {
  process.stderr.write('cron manifest: two jobs have the same name\n');
  process.exit(1);
}

const output = `// path: netlify/functions/cron-jobs.generated.mts
// GENERATED - do not edit. Source: cron/jobs/sNN-*.ts (run: node scripts/build-cron-manifest.mjs)
export const CRON_JOBS: readonly { name: string; schedule: string }[] = [
${jobs.map((j) => `  { name: '${j.name}', schedule: '${j.schedule}' },`).join('\n')}
];
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== output) {
    process.stderr.write(
      'RESULT [cron-manifest]: out of date; run node scripts/build-cron-manifest.mjs\n',
    );
    process.exit(1);
  }
  process.stdout.write(`RESULT [cron-manifest]: ok (${jobs.length} jobs)\n`);
} else {
  fs.writeFileSync(target, output);
  process.stdout.write(`cron-manifest: wrote ${jobs.length} jobs\n`);
}
