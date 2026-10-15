// path: scripts/verify/step02-core.ts
// Verification of STEP 02 pure logic (no database). Run: npx tsx scripts/verify/step02-core.ts
import assert from 'node:assert/strict';
import { csvField, toCef, toCsv, type AuditExportRow } from '@/lib/compliance/audit-export';
import { maskIp } from '@/services/audit/mask-ip';
import { merkleRoot } from '@/services/audit/merkle';
import { withTransaction } from '@/services/base/transaction';
import { DuplicateDetector, type DuplicateMatch } from '@/services/base/duplicate-detector';
import { ConflictError, DuplicateError } from '@/lib/errors';

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const row: AuditExportRow = {
  id: '018f0000-0000-7000-8000-000000000001',
  companyId: null,
  chainKey: 'platform',
  sequence: '1',
  actorUserId: null,
  actorRole: 'super_admin',
  action: 'audit.verified',
  resourceType: 'audit_log',
  resourceId: null,
  ipMasked: '10.1.2.0/24',
  correlationId: '=cmd|calc',
  createdAt: '2026-10-15T00:00:00.000Z',
  entryHash: 'a'.repeat(64),
};

async function main(): Promise<void> {
  await check('csv neutralises formulas and quotes separators', () => {
    assert.equal(csvField('=1+1'), "'=1+1");
    assert.equal(csvField('a,b'), '"a,b"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.ok(toCsv([row]).includes("'=cmd|calc"));
  });

  await check('cef escapes header and extension characters', () => {
    const line = toCef([{ ...row, action: 'a|b', correlationId: 'x=y' }]);
    assert.ok(line.startsWith('CEF:0|KD SOLUTION IT|Platform|1.0|a\\|b|'));
    assert.ok(line.includes('externalId=x\\=y'));
  });

  await check('ip masking keeps only a network prefix', () => {
    assert.equal(maskIp('203.0.113.77'), '203.0.113.0/24');
    assert.equal(maskIp('2001:db8:85a3:0:0:8a2e:370:7334'), '2001:db8:85a3::/48');
  });

  await check('merkle root is deterministic and order sensitive', async () => {
    const a = await merkleRoot(['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)]);
    assert.equal(a, await merkleRoot(['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)]));
    assert.notEqual(a, await merkleRoot(['2'.repeat(64), '1'.repeat(64), '3'.repeat(64)]));
    assert.notEqual(a, await merkleRoot(['1'.repeat(64), '2'.repeat(64)]));
  });

  await check(
    'withTransaction retries serialization failures then maps to ConflictError',
    async () => {
      let calls = 0;
      const value = await withTransaction(
        async () => {
          calls += 1;
          if (calls < 3) throw Object.assign(new Error('x'), { code: '40001' });
          return 'done';
        },
        { baseDelayMs: 1 },
      );
      assert.equal(value, 'done');
      calls = 0;
      await assert.rejects(
        withTransaction(
          async () => {
            calls += 1;
            throw Object.assign(new Error('x'), { code: '40P01' });
          },
          { baseDelayMs: 1 },
        ),
        ConflictError,
      );
      assert.equal(calls, 3);
      await assert.rejects(
        withTransaction(async () => {
          throw new Error('other');
        }),
        /other/,
      );
    },
  );

  await check('duplicate detector throws DuplicateError with matches', async () => {
    class ByName extends DuplicateDetector<{ name: string }> {
      protected fingerprintSource(input: { name: string }): string {
        return input.name.trim().toLowerCase();
      }
      protected async findExisting(fingerprint: string): Promise<DuplicateMatch[]> {
        return fingerprint.length > 0 ? [{ id: '1', reason: 'same name' }] : [];
      }
    }
    const detector = new ByName();
    assert.equal(
      await detector.fingerprint({ name: ' ACME ' }),
      await detector.fingerprint({ name: 'acme' }),
    );
    await assert.rejects(detector.assertNoDuplicate({ name: 'acme' }), DuplicateError);
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step02-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
