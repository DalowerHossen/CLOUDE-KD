// path: scripts/verify/step16-processor-health.ts
// Flow check of the processor health job with a fake processor and an in-memory database (no network, no real database).
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-processor-health.ts
import { db } from './step10-flow-setup';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { registerService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { defineAdapter } from '@/lib/payment/adapters/base';
import {
  classify,
  isDue,
  looksLikeOwnOutage,
  nextFailureCount,
  sampleFromHttp,
  shouldDisable,
} from '@/lib/payment/health-rules';
import { registerAdapterForVerification } from '@/lib/payment/registry';
import { sealCredentials } from '@/lib/payment/credentials';
import {
  checkProcessorNow,
  listHealth,
  resetHealthState,
  runHealthCycle,
} from '@/services/payment/health';
import { receiveWebhook } from '@/services/payment/webhook-core';
import type { Actor, ProcessorAdapter, ProcessorId } from '@/types/contracts';

const key = randomBytes(32);
registerService('encryption', {
  async encrypt(_p, plaintext, scope) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(scope ?? ''));
    const ct = Buffer.concat([
      c.update(typeof plaintext === 'string' ? Buffer.from(plaintext) : Buffer.from(plaintext)),
      c.final(),
    ]);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      tag: c.getAuthTag().toString('base64'),
      keyVersion: 1,
    };
  },
  async decrypt(_p, payload, scope) {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'), {
      authTagLength: 16,
    });
    d.setAAD(Buffer.from(scope ?? ''));
    d.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return new Uint8Array(
      Buffer.concat([d.update(Buffer.from(payload.ciphertext, 'base64')), d.final()]),
    );
  },
});
registerService('security', {
  rateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSeconds: 0 }),
  verifyTurnstile: async () => true,
  checkNetwork: async () => ({
    vpn: false,
    proxy: false,
    tor: false,
    datacenter: false,
    countryCode: 'US',
    score: 0,
    allowed: true,
    reason: null,
  }),
  riskScore: async () => 0,
  raiseSecurityEvent: async () => undefined,
  sanitize: <T>(v: T) => v,
});
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];
registerService('audit', {
  record: async (e) =>
    void audits.push({ action: e.action, ...(e.metadata ? { metadata: e.metadata } : {}) }),
  verifyChain: async () => ({
    ok: true,
    checkedFrom: '',
    checkedTo: '',
    firstBrokenSequence: null,
    gaps: [],
  }),
});
const notices: { userId?: string; type: string }[] = [];
registerService('notification', {
  notify: async (n) =>
    void notices.push({ ...(n.userId ? { userId: n.userId } : {}), type: n.type }),
});
const mails: { to: string; template: string }[] = [];
registerService('email', {
  send: async (m) => void mails.push({ to: m.to, template: m.template }),
  enqueue: async () => undefined,
  registerTemplate: () => undefined,
});

// The platform can reach the internet (the control request of the job).
let internet = true;
globalThis.fetch = (async () => {
  if (!internet) throw new TypeError('network down');
  return new Response('', { status: 200 });
}) as typeof fetch;

const behaviour = new Map<string, 'ok' | 'fail' | 'throw'>();
function fake(id: ProcessorId): ProcessorAdapter {
  return defineAdapter({
    id,
    displayName: `Fake ${id}`,
    capabilities: {
      supportsAuthCapture: false,
      supportsThreeDS: false,
      supportsRefund: true,
      supportsPartialRefund: true,
      supportsRecurring: false,
      supportsPayout: false,
      isMerchantOfRecord: false,
      modes: [{ id: 'default', label: 'Default', isDefault: true }],
      currencies: ['USD'],
    },
    credentialFields: [{ key: 'secretKey', label: 'Secret key', secret: true, required: true }],
    testConnection: async () => {
      const how = behaviour.get(id) ?? 'ok';
      if (how === 'throw') throw new Error('connect ECONNREFUSED');
      return how === 'ok'
        ? { ok: true, message: 'ok' }
        : { ok: false, message: 'The processor answered 503.' };
    },
    createCheckoutSession: async () => ({ clientConfig: {}, expiresAt: null }),
    authorize: async () => {
      throw new Error('not used');
    },
    charge: async () => {
      throw new Error('not used');
    },
    refund: async () => {
      throw new Error('not used');
    },
    getTransaction: async () => {
      throw new Error('not used');
    },
    verifyWebhook: async () => true,
    parseWebhook: () => {
      throw new Error('not used');
    },
    cardIdentity: () => null,
    mapDecline: () => 'other',
  });
}
const IDS: ProcessorId[] = ['stripe', 'nmi', 'adyen'];
for (const id of IDS) registerAdapterForVerification(fake(id));

async function seed(id: ProcessorId, withCredentials = true): Promise<void> {
  db.seed('processors', {
    processor_id: id,
    enabled: true,
    environment: 'sandbox',
    active_mode: 'default',
    credentials_version: 1,
    last_test_ok: true,
    disabled_reason: null,
  });
  if (!withCredentials) return;
  const sealed = await sealCredentials(fake(id), { secretKey: 'sk_test_SECRETVALUE123456' });
  db.seed('processor_credentials', {
    processor_id: id,
    credentials_version: 1,
    ciphertext: sealed.payload.ciphertext,
    iv: sealed.payload.iv,
    tag: sealed.payload.tag,
    key_version: 1,
    is_current: true,
    field_keys: sealed.fieldKeys,
    last_chars: sealed.lastChars,
  });
}
db.rpcs.set('kd_processor_auto_disable', (args) => {
  const row = db
    .rows('processors')
    .find((r) => r.processor_id === args.p_processor && r.enabled === true);
  if (!row) return false;
  row.enabled = false;
  row.disabled_reason = String(args.p_reason);
  return true;
});

const superAdmin: Actor = {
  userId: randomUUID(),
  role: 'super_admin',
  subRole: null,
  companyId: null,
  email: 'root@example.com',
  sessionId: 's',
  impersonatedBy: null,
  authenticatedAt: new Date().toISOString(),
  lastStepUpAt: new Date().toISOString(),
  mfaVerified: true,
};
const processorRow = (id: string): Record<string, unknown> => {
  const row = db.rows('processors').find((r) => r.processor_id === id);
  assert.ok(row);
  return row;
};
const failuresOf = (id: string): number =>
  Number(
    db.rows('processor_health_state').find((r) => r.processor_id === id)?.consecutive_failures ??
      -1,
  );
const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (cycle: number): Date => new Date(T0 + cycle * 10 * 60_000);

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  db.tables.clear();
  audits.length = 0;
  notices.length = 0;
  mails.length = 0;
  behaviour.clear();
  internet = true;
  db.seed('profiles', {
    user_id: superAdmin.userId,
    email: 'root@example.com',
    platform_role: 'super_admin',
  });
  try {
    await fn();
    checks += 1;
  } catch (e) {
    process.stderr.write(`FAIL ${name}\n`);
    throw e;
  }
}

async function main(): Promise<void> {
  await check('the rules: only down counts, unknown keeps the count, healthy resets it', () => {
    assert.equal(classify({ reachable: true, ms: 200 }), 'healthy');
    assert.equal(classify({ reachable: true, ms: 9000 }), 'degraded');
    assert.equal(classify({ reachable: false, ms: 10 }), 'down');
    assert.equal(sampleFromHttp(404, 50).reachable, true);
    assert.equal(sampleFromHttp(503, 50).reachable, false);
    assert.equal(classify(sampleFromHttp(429, 50)), 'degraded');
    assert.equal(nextFailureCount(2, 'down'), 3);
    assert.equal(nextFailureCount(2, 'unknown'), 2);
    assert.equal(nextFailureCount(2, 'degraded'), 0);
    assert.equal(shouldDisable(3, 3, true), true);
    assert.equal(shouldDisable(2, 3, true), false);
    assert.equal(shouldDisable(9, 3, false), false);
    assert.equal(looksLikeOwnOutage(['down', 'down']), true);
    assert.equal(looksLikeOwnOutage(['down', 'healthy']), false);
    assert.equal(looksLikeOwnOutage(['down']), false);
    assert.equal(looksLikeOwnOutage(['down', 'unknown']), false);
    assert.equal(isDue(null, at(1), 10), true);
    assert.equal(isDue(at(0).toISOString(), at(0), 10), false);
    assert.equal(isDue(at(0).toISOString(), at(1), 10), true);
  });

  await check(
    'three failures in a row switch the processor off, once, with audit, notice and e-mail',
    async () => {
      await seed('stripe');
      await seed('nmi');
      behaviour.set('nmi', 'fail');
      await runHealthCycle(at(0));
      assert.equal(failuresOf('nmi'), 1);
      await runHealthCycle(at(1));
      assert.equal(failuresOf('nmi'), 2);
      assert.equal(processorRow('nmi').enabled, true);
      const last = await runHealthCycle(at(2));
      assert.deepEqual(last.disabled, ['nmi']);
      assert.equal(processorRow('nmi').enabled, false);
      assert.match(String(processorRow('nmi').disabled_reason), /^disabled automatically/);
      assert.equal(processorRow('stripe').enabled, true);
      assert.equal(audits.filter((a) => a.action === 'processor.auto_disabled').length, 1);
      assert.deepEqual(
        notices.map((n) => n.type),
        ['system.processor_auto_disabled'],
      );
      assert.equal(notices[0]?.userId, superAdmin.userId);
      assert.deepEqual(mails, [{ to: 'root@example.com', template: 'security.alert' }]);
      const again = await runHealthCycle(at(3));
      assert.equal(again.checked, 1, 'the disabled processor is no longer checked');
      assert.equal(audits.filter((a) => a.action === 'processor.auto_disabled').length, 1);
    },
  );

  await check('one good answer in between resets the count', async () => {
    await seed('nmi');
    behaviour.set('nmi', 'fail');
    await runHealthCycle(at(0));
    await runHealthCycle(at(1));
    behaviour.set('nmi', 'ok');
    await runHealthCycle(at(2));
    assert.equal(failuresOf('nmi'), 0);
    behaviour.set('nmi', 'fail');
    await runHealthCycle(at(3));
    await runHealthCycle(at(4));
    assert.equal(processorRow('nmi').enabled, true);
  });

  await check('a throwing adapter call counts as down', async () => {
    await seed('stripe');
    await seed('nmi');
    behaviour.set('nmi', 'throw');
    for (let i = 0; i < 3; i += 1) await runHealthCycle(at(i));
    assert.equal(processorRow('nmi').enabled, false);
    assert.match(
      String(db.rows('processor_health_state').find((r) => r.processor_id === 'nmi')?.last_error),
      /ECONNREFUSED/,
    );
  });

  await check(
    'fail closed: a check that cannot run (no credentials) never switches anything off',
    async () => {
      await seed('nmi', false);
      for (let i = 0; i < 6; i += 1) await runHealthCycle(at(i));
      assert.equal(processorRow('nmi').enabled, true);
      assert.equal(failuresOf('nmi'), 0);
      assert.equal(
        db.rows('processor_health_state').find((r) => r.processor_id === 'nmi')?.status,
        'unknown',
      );
    },
  );

  await check(
    'fail closed: when the platform cannot reach the internet, down results are not counted',
    async () => {
      await seed('stripe');
      behaviour.set('stripe', 'fail');
      internet = false;
      for (let i = 0; i < 5; i += 1) await runHealthCycle(at(i));
      assert.equal(processorRow('stripe').enabled, true);
      assert.equal(failuresOf('stripe'), 0);
      assert.equal(
        audits.some((a) => a.action === 'processor.auto_disabled'),
        false,
      );
    },
  );

  await check('fail closed: every processor failing at once is not counted', async () => {
    for (const id of IDS) await seed(id);
    for (const id of IDS) behaviour.set(id, 'fail');
    for (let i = 0; i < 5; i += 1) await runHealthCycle(at(i));
    for (const id of IDS) assert.equal(processorRow(id).enabled, true);
  });

  await check('fail closed: a database error in the cycle switches nothing off', async () => {
    await seed('stripe');
    await seed('nmi');
    behaviour.set('nmi', 'fail');
    await runHealthCycle(at(0));
    await runHealthCycle(at(1));
    const original = db.from.bind(db);
    db.from = ((table: string) => {
      if (table === 'processor_health') throw new Error('database unavailable');
      return original(table);
    }) as typeof db.from;
    await assert.rejects(runHealthCycle(at(2)));
    db.from = original;
    assert.equal(processorRow('nmi').enabled, true);
  });

  await check(
    'a check asked for by the super admin is recorded but never switches a processor off',
    async () => {
      await seed('nmi');
      behaviour.set('nmi', 'fail');
      for (let i = 0; i < 5; i += 1) {
        const result = await checkProcessorNow(superAdmin, 'nmi');
        assert.equal(result.status, 'down');
      }
      assert.equal(processorRow('nmi').enabled, true);
      assert.equal(failuresOf('nmi'), 0);
      assert.equal(audits.filter((a) => a.action === 'processor.health_checked').length, 5);
      await assert.rejects(
        checkProcessorNow({ ...superAdmin, role: 'admin_staff' }, 'nmi'),
        ForbiddenError,
      );
      await assert.rejects(checkProcessorNow(superAdmin, 'bkash'));
    },
  );

  await check('a disabled processor takes no webhooks (404), whoever disabled it', async () => {
    await seed('stripe');
    const ok = await receiveWebhook('stripe', { headers: {}, rawBody: '{}' });
    assert.notEqual(ok.kind, 'unknown_processor');
    processorRow('stripe').enabled = false;
    assert.deepEqual(await receiveWebhook('stripe', { headers: {}, rawBody: '{}' }), {
      kind: 'unknown_processor',
    });
  });

  await check(
    'enabling again starts the count from zero; the health list shows all sixteen',
    async () => {
      await seed('nmi');
      behaviour.set('nmi', 'fail');
      for (let i = 0; i < 3; i += 1) await runHealthCycle(at(i));
      assert.equal(processorRow('nmi').enabled, false);
      let list = await listHealth();
      assert.equal(list.length, 16);
      const nmi = list.find((h) => h.id === 'nmi');
      assert.equal(nmi?.autoDisabled, true);
      assert.equal(nmi?.consecutiveFailures, 3);
      processorRow('nmi').enabled = true;
      processorRow('nmi').disabled_reason = null;
      await resetHealthState('nmi');
      list = await listHealth();
      const again = list.find((h) => h.id === 'nmi');
      assert.equal(again?.consecutiveFailures, 0);
      assert.equal(again?.autoDisabled, false);
      assert.equal(again?.status, 'unknown');
    },
  );

  process.stdout.write(`step16-processor-health: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
