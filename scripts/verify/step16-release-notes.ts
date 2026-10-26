// path: scripts/verify/step16-release-notes.ts
// What's new and product tours: note and tour step rules (plain text, in-app links only, at most 8 steps), the seen input, which
// notes are unseen, and the migration limit equal to the code limit.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-release-notes.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_TOUR_STEPS,
  releaseActionSchema,
  seenSchema,
  tourStepSchema,
  unseen,
} from '@/lib/platform/release-notes';

const id = '0192f0a0-0000-7000-8000-000000000001';
const note = {
  action: 'publish',
  title: 'Faster invoice list',
  body: 'It opens in under a second.',
  kind: 'feature',
  audience: 'all',
  tour: [],
};
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
const ok = (v: unknown): boolean => releaseActionSchema.safeParse(v).success;

check('a note needs a title, a body and a known kind and audience', () => {
  assert.ok(ok(note));
  assert.ok(!ok({ ...note, title: 'ab' }));
  assert.ok(!ok({ ...note, body: '' }));
  assert.ok(!ok({ ...note, kind: 'news' }));
  assert.ok(!ok({ ...note, audience: 'staff' }));
  assert.ok(!ok({ ...note, extra: 1 }));
  assert.ok(!ok({ ...note, title: '<b>Faster</b>' }));
});
check('a tour has at most 8 steps and each step links only inside the app', () => {
  const step = { title: 'Open the list', body: 'Click Invoices in the menu.', href: '/invoices' };
  assert.equal(MAX_TOUR_STEPS, 8);
  assert.ok(ok({ ...note, tour: Array.from({ length: 8 }, () => step) }));
  assert.ok(!ok({ ...note, tour: Array.from({ length: 9 }, () => step) }));
  assert.ok(tourStepSchema.safeParse({ ...step, href: null }).success);
  for (const bad of [
    'https://evil.example/x',
    '//evil.example',
    'invoices',
    '/a b',
    '/x?y=1',
    'javascript:alert(1)',
  ])
    assert.ok(!tourStepSchema.safeParse({ ...step, href: bad }).success, bad);
  assert.ok(!tourStepSchema.safeParse({ ...step, body: '<script>' }).success);
});
check('withdraw and seen input', () => {
  assert.ok(ok({ action: 'withdraw', id }));
  assert.ok(!ok({ action: 'withdraw', id: 'x' }));
  assert.ok(seenSchema.safeParse({ action: 'seen', ids: [id] }).success);
  assert.ok(seenSchema.safeParse({ action: 'tour_done', ids: [id] }).success);
  assert.ok(!seenSchema.safeParse({ action: 'seen', ids: [] }).success);
  assert.ok(
    !seenSchema.safeParse({ action: 'seen', ids: Array.from({ length: 51 }, () => id) }).success,
  );
  assert.ok(!seenSchema.safeParse({ action: 'delete', ids: [id] }).success);
});
check('unseen notes', () => {
  assert.deepEqual(unseen(['a', 'b', 'c'], new Set(['b'])), ['a', 'c']);
  assert.deepEqual(unseen([], new Set(['b'])), []);
  assert.deepEqual(unseen(['a'], new Set(['a'])), []);
});
check('the migration allows the same tour length', () => {
  const sql = readFileSync('migrations/S16_035_release_notes.sql', 'utf8');
  assert.ok(sql.includes(`jsonb_array_length(tour) <= ${MAX_TOUR_STEPS}`));
});

process.stdout.write(`step16-release-notes: ${checks} checks passed\n`);
