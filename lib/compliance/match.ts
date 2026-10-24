// path: lib/compliance/match.ts
// Name matching for sanctions screening. A name is lower-cased, stripped of accents and punctuation and cut into tokens;
// company-form words (ltd, llc, inc ...) are dropped when other words remain. Two names match when their tokens are equal,
// when all tokens of the shorter name (at least two) appear in the longer one, or when the
// words are close enough (one wrong letter in a word of five or more letters). The scores are fractions between 0 and 1 and are not money.

const ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g');

export const MATCH_THRESHOLD = 0.88;
export const MAX_QUERY_TOKENS = 40;

const FORM_WORDS = new Set([
  'ltd',
  'limited',
  'llc',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'plc',
  'pte',
  'sdn',
  'bhd',
  'the',
  'and',
  'of',
]);

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function nameTokens(value: string): string[] {
  const all = normalizeName(value)
    .split(' ')
    .filter((t) => t.length > 0);
  const kept = all.filter((t) => !FORM_WORDS.has(t));
  const tokens = kept.length > 0 ? kept : all;
  return [...new Set(tokens)].slice(0, MAX_QUERY_TOKENS);
}

function bigrams(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const padded = ` ${text} `;
  for (let i = 0; i < padded.length - 1; i += 1) {
    const pair = padded.slice(i, i + 2);
    out.set(pair, (out.get(pair) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [pair, count] of x) {
    total += count;
    shared += Math.min(count, y.get(pair) ?? 0);
  }
  for (const count of y.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

function distanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (a.length > b.length) i += 1;
      else if (a.length < b.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Likeness of two single words: 1 when equal, 0.9 for one wrong, missing or extra letter in a word of 5 or more letters. */
function wordScore(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 5 && distanceAtMostOne(a, b)) return 0.9;
  return 0;
}

function coverage(small: readonly string[], large: readonly string[]): number {
  const free = [...large];
  let total = 0;
  for (const word of small) {
    let best = 0;
    let at = -1;
    free.forEach((other, index) => {
      const score = wordScore(word, other);
      if (score > best) {
        best = score;
        at = index;
      }
    });
    if (at >= 0) free.splice(at, 1);
    total += best;
  }
  return total / small.length;
}

/** Score of two names, from 0 (nothing alike) to 1 (the same words). */
export function nameScore(a: string, b: string): number {
  const ta = nameTokens(a).sort();
  const tb = nameTokens(b).sort();
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.join(' ') === tb.join(' ')) return 1;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length >= 2) {
    const covered = coverage(small, large);
    return small.length === large.length ? covered : covered * 0.92;
  }
  return small.length === 1 && large.length === 1 ? dice(small.join(' '), large.join(' ')) : 0;
}

export interface SanctionsCandidate {
  id: string;
  source: 'ofac' | 'un';
  kind: 'person' | 'business';
  name: string;
  aliases: string[];
  countries: string[];
  programs: string;
}

export interface SanctionsHit {
  entryId: string;
  source: 'ofac' | 'un';
  name: string;
  matchedOn: string;
  score: number;
  countries: string[];
  programs: string;
}

/** Best score of a subject name against an entry (its name and its aliases), or null below the threshold. */
export function bestMatch(subject: string, entry: SanctionsCandidate): SanctionsHit | null {
  let best = { name: entry.name, score: nameScore(subject, entry.name) };
  for (const alias of entry.aliases) {
    const score = nameScore(subject, alias);
    if (score > best.score) best = { name: alias, score };
  }
  if (best.score < MATCH_THRESHOLD) return null;
  return {
    entryId: entry.id,
    source: entry.source,
    name: entry.name,
    matchedOn: best.name,
    score: Math.round(best.score * 100) / 100,
    countries: entry.countries,
    programs: entry.programs,
  };
}
