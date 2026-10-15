// path: scripts/check-migrations.mjs
// Migration guard: naming, rollback file, RLS, required columns, money types, foreign keys, idempotency.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GUARD_ROOT ?? path.resolve(here, '..');
const dir = path.join(root, 'migrations');
const errors = [];
const fail = (msg) => errors.push(msg);

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')) : [];
const ups = files.filter((f) => !f.endsWith('_down.sql'));
const downs = new Set(files.filter((f) => f.endsWith('_down.sql')));

const NAME_RE = /^S\d{2}_\d{3}_[a-z0-9_]+\.sql$/;
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const normName = (n) => n.replace(/"/g, '').replace(/^public\./, '').toLowerCase();

const REQUIRED = [
  ['id', /(^|\s)id\s+uuid\b/i],
  ['company_id', /\bcompany_id\s+uuid\b/i],
  ['created_at', /\bcreated_at\s+timestamptz\b/i],
  ['updated_at', /\bupdated_at\s+timestamptz\b/i],
  ['deleted_at', /\bdeleted_at\s+timestamptz\b/i],
  ['version', /\bversion\s+integer\b/i],
];
const MONEY_COL = /^(.*_)?(amount|price|total|balance|fee|cost|subtotal|discount|salary|wage|debit|credit)(_.*)?$/;

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function extractBody(sql, start) {
  let depth = 0;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    if (sql[i] === ')') {
      depth--;
      if (depth === 0) return { body: sql.slice(start + 1, i), end: i };
    }
  }
  return null;
}

const tables = new Map();
let allSqlClean = '';

for (const f of ups) {
  if (!NAME_RE.test(f)) fail(`${f}: name must match S{NN}_{seq3}_{description}.sql`);
  if (!downs.has(f.replace(/\.sql$/, '_down.sql'))) fail(`${f}: missing rollback file *_down.sql`);
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  if (raw.split('\n')[0] !== `-- path: migrations/${f}`) fail(`${f}: first line must be "-- path: migrations/${f}"`);
  const clean = stripComments(raw);
  allSqlClean += `\n${clean}`;

  if (/\b(float4?|float8|real|double\s+precision|money)\b/i.test(clean)) fail(`${f}: float or money column types are forbidden (use numeric(18,4))`);
  if (/on\s+delete\s+(cascade|set\s+null|set\s+default)/i.test(clean)) fail(`${f}: foreign keys must use ON DELETE RESTRICT`);
  for (const m of clean.matchAll(/references\s+[^\s(]+\s*\([^)]*\)([^,;)]*)/gi)) {
    if (!/on\s+delete\s+restrict/i.test(m[1])) fail(`${f}: every REFERENCES needs ON DELETE RESTRICT`);
  }
  for (const m of clean.matchAll(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/gi)) fail(`${f}: CREATE INDEX must use IF NOT EXISTS (${m[0].trim()})`);

  for (const m of clean.matchAll(/create\s+table\s+(if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi)) {
    if (!m[1]) fail(`${f}: CREATE TABLE ${m[2]} must use IF NOT EXISTS`);
    const name = normName(m[2]);
    const open = m.index + m[0].length - 1;
    const parsed = extractBody(clean, open);
    if (!parsed) {
      fail(`${f}: cannot parse CREATE TABLE ${name}`);
      continue;
    }
    // Guard markers live in comments, so read them from the raw text of the same statement.
    const rawStart = raw.toLowerCase().indexOf(`create table`, 0);
    const marker = raw.slice(rawStart >= 0 ? rawStart : 0).match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?;`, 'i'));
    const statementRaw = marker ? marker[0] : '';
    const appendOnly = /guard:append-only/.test(statementRaw);
    const cols = splitTopLevel(parsed.body).map((c) => c.trim()).filter(Boolean);
    const colText = cols.join(',\n');
    for (const [col, re] of REQUIRED) {
      if (appendOnly && ['updated_at', 'deleted_at', 'version'].includes(col)) continue;
      if (!re.test(colText)) fail(`${f}: table ${name} is missing required column ${col}`);
    }
    if (!/\bid\s+uuid[^,]*default\s+(public\.)?uuid_generate_v7\(\)/i.test(colText)) fail(`${f}: table ${name} id must default to uuid_generate_v7()`);
    for (const c of cols) {
      const colMatch = c.match(/^"?([a-z0-9_]+)"?\s+([a-z]+(?:\s*\([^)]*\))?)/i);
      if (!colMatch) continue;
      const [, cname, ctype] = colMatch;
      if (MONEY_COL.test(cname) && /^numeric|^decimal/i.test(ctype) && !/^(numeric|decimal)\s*\(\s*18\s*,\s*4\s*\)/i.test(ctype)) {
        fail(`${f}: money column ${name}.${cname} must be numeric(18,4)`);
      }
      if (MONEY_COL.test(cname) && /^(int|integer|bigint|smallint)/i.test(ctype) && !/_count$|_days$|_seconds$/.test(cname)) {
        fail(`${f}: money column ${name}.${cname} must be numeric(18,4), not an integer type`);
      }
    }
    tables.set(name, f);
  }
}

for (const [name, f] of tables) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?"?${escaped}"?\\s+enable\\s+row\\s+level\\s+security`, 'i');
  const helper = new RegExp(`rls_enable_default_deny\\(\\s*'(?:public\\.)?${escaped}'`, 'i');
  if (!direct.test(allSqlClean) && !helper.test(allSqlClean)) fail(`${f}: table ${name} has no RLS enable statement (rule 10)`);
}

for (const d of downs) {
  const first = fs.readFileSync(path.join(dir, d), 'utf8').split('\n')[0];
  if (first !== `-- path: migrations/${d}`) fail(`${d}: first line must be "-- path: migrations/${d}"`);
  if (!ups.includes(d.replace(/_down\.sql$/, '.sql'))) fail(`${d}: rollback file without a matching migration`);
}

if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`FAIL [migrations]: ${e}\n`);
  process.stderr.write('RESULT [migrations]: FAILED\n');
  process.exit(1);
}
process.stdout.write(`RESULT [migrations]: ok (${ups.length} migration files)\n`);
