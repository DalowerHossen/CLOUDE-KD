// path: scripts/verify/step16-automation.ts
// Logic checks of the automation tools (16.6) that need no database or network: the trigger list against the webhook events and the
// key scopes, newest-first polling with `since` and stable ids, the strict inputs of hook subscription (the SSRF guard applies) and
// payment notes, the invoice summary, the registry entries of the new endpoints, and the browser extension build (manifest rules,
// the only address it may call, and what the popup script must not contain). The services, the routes, the page and the real
// Zapier or Make apps need a running app and are not covered here.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-automation.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALL_SCOPES } from '@/lib/integrations/api-key-rules';
import {
  hookInput,
  newest,
  noteInput,
  pollQuery,
  summarize,
  TRIGGER_NAMES,
  triggerDef,
  triggerForEvent,
  TRIGGERS,
} from '@/lib/integrations/automation-rules';
import {
  buildExtension,
  configScript,
  manifestFor,
  originOf,
} from '@/lib/integrations/chrome/build';
import { ENDPOINTS } from '@/lib/integrations/public-registry';
import { WEBHOOK_EVENTS } from '@/config/s16-api';

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

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

check('every trigger has a real webhook event and a real read scope, and a registry entry', () => {
  assert.equal(TRIGGERS.length, TRIGGER_NAMES.length);
  for (const t of TRIGGERS) {
    assert.ok((WEBHOOK_EVENTS as readonly string[]).includes(t.event), t.event);
    assert.ok(ALL_SCOPES.includes(t.scope), t.scope);
    assert.equal(triggerForEvent(t.event), t.name);
    const entry = ENDPOINTS.find((e) => e.path === `/automation/triggers/${t.name}`);
    assert.equal(entry?.method, 'get');
    assert.equal(entry?.scope, t.scope);
    assert.equal(entry?.list, true);
  }
  assert.equal(triggerForEvent('invoice.created'), null);
  assert.equal(triggerDef('client-created').event, 'client.created');
});

check(
  'polling: newest first, only after `since`, at most `limit`, ties ordered by id, same ids every time',
  () => {
    const items = [
      { id: id(1), event_time: '2026-03-01T10:00:00Z' },
      { id: id(2), event_time: '2026-03-03T10:00:00Z' },
      { id: id(3), event_time: '2026-03-02T10:00:00Z' },
      { id: id(4), event_time: '2026-03-03T10:00:00Z' },
    ];
    assert.deepEqual(
      newest(items, undefined, 10).map((i) => i.id),
      [id(4), id(2), id(3), id(1)],
    );
    assert.deepEqual(
      newest(items, '2026-03-02T10:00:00Z', 10).map((i) => i.id),
      [id(4), id(2)],
    );
    assert.equal(newest(items, undefined, 2).length, 2);
    assert.deepEqual(newest(items, undefined, 10), newest(items, undefined, 10));
    assert.equal(newest(items, '2026-03-04T00:00:00Z', 10).length, 0);
    assert.equal(pollQuery.parse({}).limit, 25);
    assert.ok(!pollQuery.safeParse({ limit: '101' }).success);
    assert.ok(!pollQuery.safeParse({ since: 'yesterday' }).success);
    assert.ok(!pollQuery.safeParse({ company_id: id(1) }).success);
  },
);

check(
  'hook subscription: strict input, https public address only, known trigger and source',
  () => {
    const ok = {
      target_url: 'https://hooks.zapier.com/hooks/standard/123/abc/',
      trigger: 'invoice-paid',
      source: 'zapier',
    };
    assert.ok(hookInput.safeParse(ok).success);
    assert.ok(hookInput.safeParse({ ...ok, source: 'make' }).success);
    assert.ok(!hookInput.safeParse({ ...ok, source: 'manual' }).success);
    assert.ok(!hookInput.safeParse({ ...ok, trigger: 'invoice.created' }).success);
    assert.ok(!hookInput.safeParse({ ...ok, target_url: 'http://hooks.zapier.com/x' }).success);
    assert.ok(!hookInput.safeParse({ ...ok, target_url: 'https://127.0.0.1/x' }).success);
    assert.ok(
      !hookInput.safeParse({ ...ok, target_url: 'https://169.254.169.254/latest' }).success,
    );
    assert.ok(!hookInput.safeParse({ ...ok, target_url: 'https://localhost/x' }).success);
    assert.ok(!hookInput.safeParse({ ...ok, events: ['invoice.paid'] }).success);
    const sub = ENDPOINTS.find((e) => e.path === '/automation/hooks');
    assert.equal(sub?.returnsSecret, true);
    assert.equal(sub?.idempotent, undefined);
    assert.equal(sub?.scope, 'write:webhooks');
    const del = ENDPOINTS.find((e) => e.path === '/automation/hooks/{id}');
    assert.equal(del?.method, 'delete');
  },
);

check(
  'payment note: strict, plain text, not empty; the endpoint is sandbox only and idempotent',
  () => {
    assert.ok(noteInput.safeParse({ payment_id: id(1), note: 'Paid by cheque' }).success);
    assert.ok(!noteInput.safeParse({ payment_id: id(1), note: '' }).success);
    assert.ok(!noteInput.safeParse({ payment_id: id(1), note: '<b>x</b>' }).success);
    assert.ok(!noteInput.safeParse({ payment_id: 'x', note: 'ok' }).success);
    assert.ok(!noteInput.safeParse({ payment_id: id(1), note: 'ok', amount: '5' }).success);
    const e = ENDPOINTS.find((x) => x.path === '/automation/actions/record-payment-note');
    assert.equal(e?.sandboxOnly, true);
    assert.equal(e?.idempotent, true);
    assert.ok(e?.scope && ALL_SCOPES.includes(e.scope));
  },
);

check(
  'summary: counts by state, void left out, only open invoices add to what is owed, money exact',
  () => {
    const s = summarize(
      [
        { status: 'draft', amount_due: '10.0000', due_date: null },
        { status: 'pending_approval', amount_due: '5.0000', due_date: null },
        { status: 'paid', amount_due: '0.0000', due_date: '2026-01-01' },
        { status: 'void', amount_due: '99.0000', due_date: '2026-01-01' },
        { status: 'sent', amount_due: '100.1000', due_date: '2026-04-01' },
        { status: 'partially_paid', amount_due: '0.2000', due_date: '2026-02-01' },
        { status: 'overdue', amount_due: '1.0000', due_date: '2026-02-01' },
      ],
      '2026-03-01',
    );
    assert.equal(s.invoices_counted, 7);
    assert.equal(s.draft, 2);
    assert.equal(s.paid, 1);
    assert.equal(s.sent, 3);
    assert.equal(s.overdue, 2);
    assert.equal(s.amount_due, '101.3000');
    assert.equal(summarize([], '2026-03-01').amount_due, '0.0000');
  },
);

check(
  'extension manifest: version 3, storage only, one host, no remote code, https platform address only',
  () => {
    assert.equal(originOf('https://app.example.com/some/path?x=1'), 'https://app.example.com');
    assert.throws(() => originOf('http://app.example.com'));
    assert.throws(() => originOf('https://user:pw@app.example.com'));
    assert.throws(() => originOf('not a url'));
    const m = manifestFor('https://app.example.com', '1.2.0');
    assert.equal(m.manifest_version, 3);
    assert.deepEqual(m.permissions, ['storage']);
    assert.deepEqual(m.host_permissions, ['https://app.example.com/api/public/v1/*']);
    assert.match(m.content_security_policy.extension_pages, /script-src 'self'/);
    assert.ok(!/unsafe-eval|unsafe-inline|https?:/.test(m.content_security_policy.extension_pages));
    assert.throws(() => manifestFor('https://app.example.com', '1.x'));
    assert.equal(
      configScript('https://app.example.com'),
      'globalThis.KD_API_ORIGIN = "https://app.example.com";\n',
    );
  },
);

check(
  'extension build: files written, the popup calls only the API variable and never uses eval or innerHTML',
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-ext-'));
    try {
      const files = buildExtension('https://app.example.com', dir);
      for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), f);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as {
        action: { default_popup: string };
      };
      assert.equal(manifest.action.default_popup, 'popup.html');
      const js = fs.readFileSync(path.join(dir, 'popup.js'), 'utf8');
      assert.ok(
        !/\beval\s*\(|new Function|innerHTML|outerHTML|document\.write|insertAdjacentHTML/.test(js),
      );
      assert.deepEqual(
        [...js.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]),
        [],
      );
      assert.ok(js.includes("globalThis.KD_API_ORIGIN + '/api/public/v1'"));
      assert.ok(js.includes('chrome.storage.local'));
      assert.ok(!js.includes('chrome.storage.sync'));
      const html = fs.readFileSync(path.join(dir, 'popup.html'), 'utf8');
      assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html));
      assert.ok(!/\son[a-z]+=/i.test(html));
      assert.ok(html.indexOf('config.js') < html.indexOf('popup.js'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

process.stdout.write(`step16-automation: ${checks} checks passed\n`);
