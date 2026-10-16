// path: scripts/verify/step04-core.ts
// Verification of STEP 04 logic that needs no database and no network. Run: npx tsx scripts/verify/step04-core.ts
import assert from 'node:assert/strict';
import { buildCsp, buildTrustedTypesPolicy, profileForPath } from '@/lib/security/csp';
import { securityHeaders } from '@/lib/security/headers';
import { hasHeaderInjection, safeFileName, stripHeaderInjection } from '@/lib/security/http-safety';
import { isNonPublicIp } from '@/lib/security/ip';
import { isAllowedExternalRedirect, safeRedirectPath } from '@/lib/security/redirect';
import { SsrfError, resolvePublicAddresses, validateOutboundUrl } from '@/lib/security/ssrf';

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

async function main(): Promise<void> {
  await check('csp: nonce on scripts, no unsafe-inline for scripts, frames denied', () => {
    const csp = buildCsp({
      nonce: 'abc123',
      production: true,
      supabaseOrigin: 'https://x.supabase.co',
    });
    const script = csp.split('; ').find((d) => d.startsWith('script-src ')) ?? '';
    assert.ok(script.includes("'nonce-abc123'"));
    assert.ok(script.includes("'strict-dynamic'"));
    assert.equal(script.includes('unsafe-inline'), false);
    assert.equal(script.includes('unsafe-eval'), false);
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("script-src-attr 'none'"));
    assert.ok(csp.includes('connect-src') && csp.includes('wss://x.supabase.co'));
    assert.ok(csp.includes('upgrade-insecure-requests'));
    assert.ok(buildCsp({ nonce: 'n', production: false }).includes("'unsafe-eval'"));
  });

  await check('csp: payment profile allows only the processor and no Turnstile', () => {
    const csp = buildCsp({
      nonce: 'n',
      production: true,
      profile: 'payment',
      processorOrigins: ['https://js.processor.example', 'http://insecure.example'],
    });
    assert.ok(csp.includes('https://js.processor.example'));
    assert.equal(csp.includes('insecure.example'), false);
    assert.equal(csp.includes('challenges.cloudflare.com'), false);
    assert.equal(profileForPath('/pay/abc'), 'payment');
    assert.equal(profileForPath('/dashboard'), 'default');
    assert.ok(buildTrustedTypesPolicy().includes("require-trusted-types-for 'script'"));
  });

  await check('headers: HSTS only in production, framing and sniffing blocked', () => {
    const prod = securityHeaders({ csp: 'x', trustedTypesReportOnly: 'y', production: true });
    assert.ok(prod['strict-transport-security']?.includes('max-age=31536000'));
    assert.equal(prod['x-frame-options'], 'DENY');
    assert.equal(prod['x-content-type-options'], 'nosniff');
    assert.equal(prod['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(prod['permissions-policy']?.includes('camera=()'));
    assert.equal(
      securityHeaders({ csp: 'x', trustedTypesReportOnly: 'y', production: false })[
        'strict-transport-security'
      ],
      undefined,
    );
  });

  await check('open redirect payloads are refused', () => {
    for (const bad of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      '/%2F%2Fevil.example',
      '/dashboard/../..//x',
      '/dashboard\r\nSet-Cookie: a=b',
      '',
      'dashboard',
    ]) {
      assert.equal(safeRedirectPath(bad), null, bad);
    }
    assert.equal(safeRedirectPath('/dashboard'), '/dashboard');
    assert.equal(safeRedirectPath('/dashboard?tab=1'), '/dashboard?tab=1');
    assert.equal(safeRedirectPath('/admin/audit'), '/admin/audit');
    assert.equal(safeRedirectPath('/dashboardx'), null);
    assert.equal(safeRedirectPath('/login'), null);
    assert.equal(isAllowedExternalRedirect('https://app.example.com/x', ['app.example.com']), true);
    assert.equal(
      isAllowedExternalRedirect('https://app.example.com.evil.io/x', ['app.example.com']),
      false,
    );
    assert.equal(isAllowedExternalRedirect('http://app.example.com', ['app.example.com']), false);
    assert.equal(
      isAllowedExternalRedirect('https://user@app.example.com', ['app.example.com']),
      false,
    );
  });

  await check(
    'ip classification: private, loopback, link-local, mapped and reserved addresses',
    () => {
      for (const ip of [
        '10.0.0.1',
        '172.16.5.4',
        '172.31.255.255',
        '192.168.1.1',
        '127.0.0.1',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '255.255.255.255',
        '::1',
        '::',
        'fe80::1',
        'fc00::1',
        'fd12::1',
        '::ffff:127.0.0.1',
        '::ffff:10.1.2.3',
        '64:ff9b::7f00:1',
        'ff02::1',
        '2001:db8::1',
      ]) {
        assert.equal(isNonPublicIp(ip), true, ip);
      }
      for (const ip of [
        '8.8.8.8',
        '1.1.1.1',
        '172.32.0.1',
        '203.0.114.1',
        '2606:4700:4700::1111',
        '::ffff:8.8.8.8',
      ]) {
        assert.equal(isNonPublicIp(ip), false, ip);
      }
      assert.equal(isNonPublicIp('not an ip'), true);
    },
  );

  await check('ssrf: static url checks', () => {
    for (const bad of [
      'http://example.com',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://[::1]/x',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.5',
      'https://user:pw@example.com',
      'https://example.com:8443/x',
      'https://2130706433/',
      'https://127.1/',
      'https://0x7f000001/',
      'https://service.internal/x',
      'https://printer.local/',
      'file:///etc/passwd',
      'gopher://example.com',
      'https://[::ffff:127.0.0.1]/',
      '',
    ]) {
      assert.throws(() => validateOutboundUrl(bad), SsrfError, bad);
    }
    assert.equal(validateOutboundUrl('https://example.com/hook?a=1').hostname, 'example.com');
    assert.equal(validateOutboundUrl('https://example.com:443/hook').port, '');
  });

  await check('ssrf: resolution refuses private answers', async () => {
    await assert.rejects(resolvePublicAddresses('127.0.0.1'), SsrfError);
    await assert.rejects(resolvePublicAddresses('localhost'), SsrfError);
    assert.deepEqual(await resolvePublicAddresses('8.8.8.8'), ['8.8.8.8']);
  });

  await check('http safety: header injection and file names', () => {
    assert.equal(stripHeaderInjection('a\r\nSet-Cookie: x=1'), 'a Set-Cookie: x=1');
    assert.equal(hasHeaderInjection('a\nb'), true);
    assert.equal(hasHeaderInjection('ab'), false);
    assert.equal(safeFileName('../../etc/passwd'), 'passwd');
    assert.equal(safeFileName('a"b;c.pdf'), 'abc.pdf');
    assert.equal(safeFileName('..'), 'file');
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step04-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
