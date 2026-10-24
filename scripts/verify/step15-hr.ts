// path: scripts/verify/step15-hr.ts
// Logic checks of the HR rules (15.10) that need no database: the organisation tree and the loop guard, the checklist templates
// and due days, leave days (weekdays and half days), the days left, the yearly entitlement with carry over, the request inputs
// (including the portal input that carries no employee), and the performance report. The table rules (no loops, overlap, the
// balance limit, one calendar year) are in sql/assertions/s15_013_hr.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-hr.ts
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATES,
  assignInput,
  buildTree,
  daysLeft,
  dueDay,
  leaveDays,
  leaveRequestInput,
  performanceInput,
  performanceReport,
  portalLeaveInput,
  templateInput,
  wouldLoop,
  yearlyEntitlement,
} from '@/services/hr/hr-rules';

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

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

check('tree nests children under their parent', () => {
  const tree = buildTree([
    { id: A, label: 'Company', parentId: null },
    { id: B, label: 'Sales', parentId: A },
    { id: C, label: 'Support', parentId: A },
  ]);
  assert.equal(tree.length, 1);
  assert.deepEqual(
    tree[0]?.children.map((c) => c.label),
    ['Sales', 'Support'],
  );
});

check('a row with a missing parent becomes a root and a loop cannot hang the builder', () => {
  const lone = buildTree([{ id: B, label: 'Sales', parentId: C }]);
  assert.equal(lone.length, 1);
  const looped = buildTree([
    { id: A, label: 'A', parentId: B },
    { id: B, label: 'B', parentId: A },
  ]);
  assert.ok(Array.isArray(looped));
});

check('wouldLoop sees a parent that is below the row', () => {
  const parentOf = new Map<string, string | null>([
    [A, null],
    [B, A],
    [C, B],
  ]);
  assert.equal(wouldLoop(parentOf, A, C), true);
  assert.equal(wouldLoop(parentOf, C, A), false);
  assert.equal(wouldLoop(parentOf, A, A), true);
  assert.equal(wouldLoop(parentOf, A, null), false);
});

check('the assign input is strict and allows clearing a place', () => {
  assert.ok(assignInput.safeParse({ version: 1, departmentId: null }).success);
  assert.ok(!assignInput.safeParse({ version: 1, extra: 1 }).success);
  assert.ok(!assignInput.safeParse({ version: 1, managerId: 'x' }).success);
});

check('usual templates have an onboarding and an offboarding list', () => {
  assert.deepEqual(DEFAULT_TEMPLATES.map((x) => x.kind).sort(), ['offboarding', 'onboarding']);
  assert.ok(DEFAULT_TEMPLATES.every((x) => x.items.length >= 5));
});

check('a template accepts plain text items from the form', () => {
  const r = templateInput.safeParse({ kind: 'onboarding', name: 'X', items: ['One', 'Two'] });
  assert.ok(r.success);
  assert.equal(r.success && r.data.items[0]?.daysAfter, 0);
  assert.ok(!templateInput.safeParse({ kind: 'onboarding', name: 'X', items: [] }).success);
  assert.ok(!templateInput.safeParse({ kind: 'onboarding', name: 'X', items: ['<b>'] }).success);
});

check('due day adds days to the start', () => {
  assert.equal(dueDay('2026-01-30', 3), '2026-02-02');
  assert.equal(dueDay('2026-03-01', 0), '2026-03-01');
});

check('leave days count weekdays only', () => {
  assert.equal(leaveDays('2026-03-02', '2026-03-06', false), '5');
  assert.equal(leaveDays('2026-03-06', '2026-03-09', false), '2');
  assert.equal(leaveDays('2026-03-07', '2026-03-08', false), '0');
  assert.equal(leaveDays('2026-03-09', '2026-03-02', false), '0');
});

check('a half day is one weekday only', () => {
  assert.equal(leaveDays('2026-03-04', '2026-03-04', true), '0.5');
  assert.equal(leaveDays('2026-03-04', '2026-03-05', true), '0');
});

check('days left never go below zero and count waiting days', () => {
  assert.equal(daysLeft('20', '5', '3'), '12.0000');
  assert.equal(daysLeft('5', '5', '3'), '0.0000');
});

check('entitlement is in proportion for a new employee, rounded to half days', () => {
  assert.equal(yearlyEntitlement('24', '2020-01-01', 2026, '0', '0'), '24.0000');
  assert.equal(yearlyEntitlement('24', '2026-07-15', 2026, '0', '0'), '12.0000');
  assert.equal(yearlyEntitlement('20', '2026-10-01', 2026, '0', '0'), '5.0000');
  assert.equal(yearlyEntitlement('20', '2027-01-01', 2026, '0', '0'), '0.0000');
});

check('carry over stops at the limit', () => {
  assert.equal(yearlyEntitlement('20', '2020-01-01', 2026, '5', '8'), '25.0000');
  assert.equal(yearlyEntitlement('20', '2020-01-01', 2026, '5', '2'), '22.0000');
});

check('a leave request checks its dates', () => {
  const base = { employeeId: A, leaveTypeId: B, startDate: '2026-03-02', endDate: '2026-03-04' };
  assert.ok(leaveRequestInput.safeParse(base).success);
  assert.ok(!leaveRequestInput.safeParse({ ...base, endDate: '2026-03-01' }).success);
  assert.ok(!leaveRequestInput.safeParse({ ...base, endDate: '2026-02-30' }).success);
  assert.ok(!leaveRequestInput.safeParse({ ...base, halfDay: true }).success);
});

check('the portal input carries no employee', () => {
  const ok = { leaveTypeId: B, startDate: '2026-03-02', endDate: '2026-03-02' };
  assert.ok(portalLeaveInput.safeParse(ok).success);
  assert.ok(!portalLeaveInput.safeParse({ ...ok, employeeId: A }).success);
});

check('a review needs a period and a rating, a note has no rating', () => {
  const base = { employeeId: A, body: 'Good work' };
  assert.ok(performanceInput.safeParse(base).success);
  assert.ok(!performanceInput.safeParse({ ...base, rating: 4 }).success);
  assert.ok(!performanceInput.safeParse({ ...base, kind: 'review', rating: 4 }).success);
  assert.ok(
    performanceInput.safeParse({ ...base, kind: 'review', rating: 4, period: '2026 Q1' }).success,
  );
  assert.ok(
    !performanceInput.safeParse({ ...base, kind: 'review', rating: 6, period: 'x' }).success,
  );
});

check('the performance report averages ratings with one decimal', () => {
  const rows = performanceReport([
    { employeeId: A, kind: 'review', period: '2026 Q1', rating: 4, raiseSuggested: false },
    { employeeId: A, kind: 'review', period: '2026 Q1', rating: 5, raiseSuggested: true },
    { employeeId: A, kind: 'note', period: '2026 Q1', rating: null, raiseSuggested: false },
    { employeeId: B, kind: 'note', period: '', rating: null, raiseSuggested: false },
  ]);
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.employeeId === A);
  assert.equal(a?.average, '4.5');
  assert.equal(a?.reviews, 2);
  assert.equal(a?.notes, 1);
  assert.equal(a?.raiseSuggested, true);
  assert.equal(rows.find((r) => r.employeeId === B)?.average, null);
});

process.stdout.write(`step15-hr: ${checks} checks passed\n`);
