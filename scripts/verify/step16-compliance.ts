// path: scripts/verify/step16-compliance.ts
// Logic checks of the compliance part that need no database or network: name matching (accents, order, aliases, company forms,
// near misses), the inputs of the country and import routes, the rows built for the database, and the network decision for a
// country switched on at run time. The tables and the replace function are tested in sql/assertions/s16_016_compliance.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-compliance.ts
import assert from 'node:assert/strict';
import {
  MATCH_THRESHOLD,
  bestMatch,
  nameScore,
  nameTokens,
  normalizeName,
  type SanctionsCandidate,
} from '@/lib/compliance/match';
import { countryInput, countryPatch, sanctionsImport, toRow } from '@/lib/compliance/rules';
import { evaluateNetwork } from '@/lib/security/network/evaluate';
import { EMPTY_SIGNALS } from '@/lib/security/network/types';

const E_ACUTE = String.fromCharCode(0xe9);
const A_ACUTE = String.fromCharCode(0xc1);
let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const entry = (name: string, aliases: string[] = []): SanctionsCandidate => ({
  id: 'e1',
  source: 'un',
  kind: 'person',
  name,
  aliases,
  countries: ['XX'],
  programs: 'TEST',
});

check('normalize removes accents, case and punctuation', () => {
  assert.equal(normalizeName(`  Jos${E_ACUTE}  O'Brien-Smith `), 'jose o brien smith');
});

check('tokens drop company forms and repeats', () => {
  assert.deepEqual(nameTokens('Acme Trading Co., Ltd.').sort(), ['acme', 'trading']);
  assert.deepEqual(nameTokens('The Company'), ['the', 'company']);
});

check('same name in another order or with accents scores 1', () => {
  assert.equal(nameScore('Mohammed Ali Hassan', 'Hassan, Mohammed Ali'), 1);
  assert.equal(nameScore(`Jos${E_ACUTE} ${A_ACUTE}lvarez`, 'jose alvarez'), 1);
});

check('all words of a shorter name inside a longer one score high', () => {
  assert.ok(nameScore('Ali Hassan', 'Mohammed Ali Hassan') >= MATCH_THRESHOLD);
});

check('a single shared word is not a match', () => {
  assert.ok(nameScore('Ali', 'Mohammed Ali Hassan') < MATCH_THRESHOLD);
  assert.ok(nameScore('John Smith', 'John Baker') < MATCH_THRESHOLD);
});

check('a small spelling difference still matches', () => {
  assert.ok(nameScore('Mohammad Hassan', 'Mohammed Hassan') >= MATCH_THRESHOLD);
});

check('different names do not match', () => {
  assert.equal(bestMatch('Green Valley Foods', entry('Acme Trading')), null);
});

check('an alias can carry the match', () => {
  const hit = bestMatch('Jay Roe', entry('Jane Roe', ['Jay Roe']));
  assert.ok(hit);
  assert.equal(hit.matchedOn, 'Jay Roe');
  assert.equal(hit.score, 1);
});

check('country input is strict and checks the code', () => {
  const ok = countryInput.safeParse({ countryCode: 'KP', reason: 'Security Council measure' });
  assert.ok(ok.success);
  assert.equal(ok.data.mode, 'block');
  assert.equal(
    countryInput.safeParse({ countryCode: 'kp', reason: 'Security Council measure' }).success,
    false,
  );
  assert.equal(countryInput.safeParse({ countryCode: 'KP', reason: 'short' }).success, false);
  assert.equal(
    countryInput.safeParse({ countryCode: 'KP', reason: 'Security Council measure', extra: 1 })
      .success,
    false,
  );
});

check('country patch needs a change and a version', () => {
  assert.equal(countryPatch.safeParse({ version: 1 }).success, false);
  assert.equal(countryPatch.safeParse({ enabled: false }).success, false);
  assert.ok(countryPatch.safeParse({ enabled: false, version: 2 }).success);
});

check('import input and the database row', () => {
  const parsed = sanctionsImport.safeParse({
    source: 'ofac',
    entries: [
      { sourceUid: '1', kind: 'person', name: 'Jane Roe', aliases: ['J. Roe'], countries: ['US'] },
    ],
  });
  assert.ok(parsed.success);
  const row = toRow(parsed.data.entries[0] as never);
  assert.deepEqual([...row.search_tokens].sort(), ['j', 'jane', 'roe']);
  assert.equal(parsed.data.force, false);
  assert.equal(sanctionsImport.safeParse({ source: 'eu', entries: [] }).success, false);
  assert.equal(sanctionsImport.safeParse({ source: 'un', entries: [] }).success, false);
});

check('a country switched on at run time is refused, others are not', () => {
  const base = {
    context: 'login' as const,
    signals: { ...EMPTY_SIGNALS, countryCode: 'KP' },
    whitelisted: false,
    ipBlocked: false,
    providerFailed: false,
    failClosedContexts: [],
  };
  assert.equal(evaluateNetwork(base).allowed, true);
  const blocked = evaluateNetwork({ ...base, extraBlockedCountries: ['KP'] });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'country_blocked');
  assert.equal(
    evaluateNetwork({
      ...base,
      signals: { ...EMPTY_SIGNALS, countryCode: 'DE' },
      extraBlockedCountries: ['KP'],
    }).allowed,
    true,
  );
  assert.equal(
    evaluateNetwork({ ...base, extraBlockedCountries: ['KP'], whitelisted: true }).allowed,
    true,
  );
});

process.stdout.write(`step16-compliance: ${checks} checks passed\n`);
