// path: scripts/verify/step04-core.ts
// Verification of STEP 04 logic that needs no database and no network. Run: npx tsx scripts/verify/step04-core.ts
import assert from 'node:assert/strict';
import { buildCsp, buildTrustedTypesPolicy, profileForPath } from '@/lib/security/csp';
import { securityHeaders } from '@/lib/security/headers';
import { hasHeaderInjection, safeFileName, stripHeaderInjection } from '@/lib/security/http-safety';
import { isNonPublicIp } from '@/lib/security/ip';
import { isAllowedExternalRedirect, safeRedirectPath } from '@/lib/security/redirect';
import {
  cleanString,
  detectInjection,
  detectInjectionDeep,
  hasPathTraversal,
  sanitize,
  SanitizerError,
} from '@/lib/security/sanitizer';
import { sanitizeHtml, stripHtml } from '@/lib/security/rich-text';
import { inspectUserAgent } from '@/lib/middleware/bot-detector';
import {
  checkCsrf,
  createCsrfToken,
  isValidCsrfToken,
  isSameOrigin,
  requiresCsrfCheck,
} from '@/lib/middleware/csrf';
import { policyFor, rateLimitHeaders } from '@/lib/middleware/rate-limit';
import { evaluateNetwork } from '@/lib/security/network/evaluate';
import { parseIpqs, parseMaxmind } from '@/lib/security/network/providers';
import { EMPTY_SIGNALS } from '@/lib/security/network/types';
import { parseTorList } from '@/lib/security/network/tor';
import { SsrfError, resolvePublicAddresses, validateOutboundUrl } from '@/lib/security/ssrf';

/** Builds a character from its hexadecimal code point, so the source file stays ASCII. */
const U = (hex: string): string => String.fromCodePoint(Number.parseInt(hex, 16));

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

  await check('sanitizer: NFC, invisible characters, null bytes, dangerous keys', () => {
    assert.equal(cleanString('e' + U('0301') + ''), '' + U('00e9') + '');
    assert.equal(cleanString('ab' + U('200b') + 'c' + U('202e') + 'd' + U('feff') + ''), 'abcd');
    assert.equal(cleanString('a' + U('0000') + 'b'), 'ab');
    assert.equal(cleanString('line\nnext\ttab'), 'line\nnext\ttab');
    const polluted = JSON.parse(
      '{"a":1,"__proto__":{"admin":true},"constructor":{"x":1},"nested":{"prototype":1,"ok":"v\\u200b"}}',
    ) as Record<string, unknown>;
    const clean = sanitize(polluted) as { a: number; nested: Record<string, unknown> };
    assert.equal(Object.keys(clean).sort().join(','), 'a,nested');
    assert.deepEqual(clean.nested, { ok: 'v' });
    assert.equal(({} as Record<string, unknown>).admin, undefined);
    assert.notEqual(sanitize(polluted), polluted);
    let deep: unknown = 'x';
    for (let i = 0; i < 40; i++) deep = [deep];
    assert.throws(() => sanitize(deep), SanitizerError);
    assert.deepEqual(sanitize([1, null, true, 'a' + U('200b') + '']), [1, null, true, 'a']);
  });

  await check('sanitizer: path traversal spellings', () => {
    for (const bad of [
      '../x',
      'a/../../b',
      '..\\win',
      '%2e%2e/x',
      '%252e%252e%252fx',
      '/etc/passwd',
      'C:\\x',
      'a' + U('0000') + 'b',
      '%00',
      '....//x%2f',
    ]) {
      assert.equal(hasPathTraversal(bad), true, bad);
    }
    for (const good of ['invoice-2026.pdf', 'folder/file.txt', 'a.b.c'])
      assert.equal(hasPathTraversal(good), false, good);
  });

  await check('injection detection: payload list is flagged, normal text is not', () => {
    const sql = [
      "' OR 1=1 --",
      "1' UNION SELECT username, password FROM users --",
      "x'; DROP TABLE invoices; --",
      '1) or (1)=(1',
      'SELECT * FROM information_schema.tables',
      "'; select pg_sleep(5) --",
      'a; truncate table b',
    ];
    const xss = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      '<svg onload=alert(1)>',
      '"><iframe src=//evil>',
      '<a href="data:text/html;base64,AAA">x</a>',
      '<body onload = "x()">',
    ];
    for (const p of sql) assert.equal(detectInjection(p), 'sql_injection_attempt', p);
    for (const p of xss) assert.equal(detectInjection(p), 'xss_attempt', p);
    for (const ok of [
      'Invoice for Acme Corp, net 30',
      "O'Brien and Sons",
      'Select your plan from the list',
      'Total: 1,200.50 USD',
      'We update the price - see you soon',
    ]) {
      assert.equal(detectInjection(ok), null, ok);
    }
    assert.equal(detectInjectionDeep({ a: [{ b: '<script>x</script>' }] }), 'xss_attempt');
    assert.equal(detectInjectionDeep({ '<script>': 'x' }), 'xss_attempt');
    assert.equal(detectInjectionDeep({ a: 'fine', b: [1, 2] }), null);
  });

  await check('rich text: scripts, handlers and unsafe links removed', () => {
    const dirty =
      '<p onclick="x()">Hi <b>there</b></p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe>';
    const clean = sanitizeHtml(dirty);
    assert.ok(clean.includes('<b>there</b>'));
    for (const bad of ['<script', 'onclick', 'javascript:', 'onerror', '<iframe', '<img'])
      assert.equal(clean.includes(bad), false, bad);
    assert.equal(stripHtml('<p>a<b>b</b></p>'), 'ab');
    assert.ok(sanitizeHtml('<a href="https://example.com">ok</a>').includes('https://example.com'));
  });

  await check('csrf: signed token, origin check, exemptions', async () => {
    const secret = 's'.repeat(48);
    const token = await createCsrfToken(secret);
    assert.equal(await isValidCsrfToken(token, secret), true);
    assert.equal(await isValidCsrfToken(token, 'z'.repeat(48)), false);
    assert.equal(await isValidCsrfToken(`${token.split('.')[0]}.${'0'.repeat(64)}`, secret), false);
    assert.equal(await isValidCsrfToken('abc', secret), false);
    assert.equal(await isValidCsrfToken(undefined, secret), false);
    const base = {
      method: 'POST',
      pathname: '/api/auth/login',
      origin: 'https://app.example.com',
      referer: null,
      appOrigin: 'https://app.example.com',
      cookieToken: token,
      headerToken: token,
      secret,
    };
    assert.equal(await checkCsrf(base), 'ok');
    assert.equal(await checkCsrf({ ...base, origin: 'https://evil.example' }), 'bad_origin');
    assert.equal(
      await checkCsrf({ ...base, origin: null, referer: 'https://app.example.com/login' }),
      'ok',
    );
    assert.equal(await checkCsrf({ ...base, origin: null, referer: null }), 'bad_origin');
    assert.equal(await checkCsrf({ ...base, headerToken: null }), 'missing_token');
    assert.equal(
      await checkCsrf({ ...base, headerToken: await createCsrfToken(secret) }),
      'mismatch',
    );
    const forged = `${'a'.repeat(48)}.${'b'.repeat(64)}`;
    assert.equal(
      await checkCsrf({ ...base, cookieToken: forged, headerToken: forged }),
      'invalid_signature',
    );
    assert.equal(
      await checkCsrf({ ...base, method: 'GET', cookieToken: undefined, headerToken: null }),
      'ok',
    );
    assert.equal(requiresCsrfCheck('POST', '/api/webhooks/stripe'), false);
    assert.equal(requiresCsrfCheck('POST', '/api/cron/worker-tick'), false);
    assert.equal(requiresCsrfCheck('DELETE', '/api/auth/oauth/unlink'), true);
    assert.equal(requiresCsrfCheck('POST', '/login'), false);
    assert.equal(
      isSameOrigin('https://app.example.com.evil.io', null, 'https://app.example.com'),
      false,
    );
  });

  await check('bot detector: headless, scanners and malformed user agents', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    assert.deepEqual(inspectUserAgent(chrome, '/login'), { ok: true });
    assert.deepEqual(inspectUserAgent(null, '/login'), { ok: false, reason: 'missing_user_agent' });
    assert.deepEqual(inspectUserAgent('', '/login'), { ok: false, reason: 'missing_user_agent' });
    assert.deepEqual(inspectUserAgent('Mozilla/5.0 HeadlessChrome/120', '/login'), {
      ok: false,
      reason: 'headless',
    });
    assert.deepEqual(inspectUserAgent('python-requests/2.31', '/api/auth/login'), {
      ok: false,
      reason: 'scanner',
    });
    assert.deepEqual(inspectUserAgent('sqlmap/1.7', '/'), { ok: false, reason: 'scanner' });
    assert.deepEqual(inspectUserAgent('x'.repeat(600), '/'), {
      ok: false,
      reason: 'invalid_user_agent',
    });
    assert.deepEqual(inspectUserAgent('Mozilla/5.0 ' + U('e9'), '/'), {
      ok: false,
      reason: 'invalid_user_agent',
    });
    assert.deepEqual(inspectUserAgent('curl/8.0', '/api/webhooks/stripe'), { ok: true });
    assert.deepEqual(inspectUserAgent(null, '/api/cron/worker-tick'), { ok: true });
  });

  await check('rate limit policies and headers', () => {
    assert.equal(policyFor('auth').limit, 10);
    assert.equal(policyFor('unknown-policy').limit, policyFor('api-default').limit);
    const denied = rateLimitHeaders(
      { allowed: false, remaining: 0, retryAfterSeconds: 17 },
      policyFor('auth'),
    );
    assert.equal(denied['retry-after'], '17');
    assert.equal(denied['x-ratelimit-limit'], '10');
    const ok = rateLimitHeaders(
      { allowed: true, remaining: 4, retryAfterSeconds: 0 },
      policyFor('auth'),
    );
    assert.equal(ok['retry-after'], undefined);
    assert.equal(ok['x-ratelimit-remaining'], '4');
  });

  await check('network policy: block on signup, payment, kyc, admin; flag on login', () => {
    const vpn = { ...EMPTY_SIGNALS, vpn: true, countryCode: 'DE' };
    const base = {
      signals: vpn,
      whitelisted: false,
      ipBlocked: false,
      providerFailed: false,
      failClosedContexts: ['signup', 'payment', 'kyc', 'admin'] as const,
    };
    for (const context of ['signup', 'payment', 'kyc', 'admin'] as const) {
      const r = evaluateNetwork({ ...base, context });
      assert.equal(r.allowed, false, context);
      assert.equal(r.reason, 'anonymizing_network');
    }
    const login = evaluateNetwork({ ...base, context: 'login' });
    assert.equal(login.allowed, true);
    assert.equal(login.reason, 'flagged_anonymizing_network');
    const tor = evaluateNetwork({
      ...base,
      context: 'payment',
      signals: { ...EMPTY_SIGNALS, tor: true },
    });
    assert.equal(tor.allowed, false);
    assert.equal(tor.score, 100);
    assert.equal(evaluateNetwork({ ...base, context: 'payment', whitelisted: true }).allowed, true);
    assert.equal(
      evaluateNetwork({ ...base, context: 'login', signals: EMPTY_SIGNALS, ipBlocked: true })
        .reason,
      'address_blocked',
    );
    assert.equal(
      evaluateNetwork({ ...base, context: 'signup', signals: EMPTY_SIGNALS }).allowed,
      true,
    );
  });

  await check('network policy: provider outage fails closed only in sensitive contexts', () => {
    const base = {
      signals: EMPTY_SIGNALS,
      whitelisted: false,
      ipBlocked: false,
      providerFailed: true,
      failClosedContexts: ['signup', 'payment', 'kyc', 'admin'] as const,
    };
    for (const context of ['signup', 'payment', 'kyc', 'admin'] as const) {
      const r = evaluateNetwork({ ...base, context });
      assert.equal(r.allowed, false, context);
      assert.equal(r.reason, 'provider_unavailable');
    }
    assert.equal(evaluateNetwork({ ...base, context: 'login' }).allowed, true);
    assert.equal(evaluateNetwork({ ...base, context: 'other' }).allowed, true);
  });

  await check('provider answers are parsed into signals', () => {
    const q = parseIpqs({
      success: true,
      fraud_score: 91,
      country_code: 'nl',
      proxy: true,
      vpn: true,
      tor: false,
      connection_type: 'Data Center',
    });
    assert.deepEqual(
      [q.vpn, q.proxy, q.tor, q.datacenter, q.providerScore, q.countryCode],
      [true, true, false, true, 91, 'NL'],
    );
    assert.throws(() => parseIpqs({ success: false, message: 'Invalid key' }), /Invalid key/);
    assert.equal(parseIpqs({ success: true, active_tor: true }).tor, true);
    const m = parseMaxmind({
      country: { iso_code: 'us' },
      traits: { is_anonymous: true, is_anonymous_vpn: true, is_hosting_provider: true },
    });
    assert.deepEqual([m.vpn, m.datacenter, m.tor, m.countryCode], [true, true, false, 'US']);
    assert.equal(parseMaxmind({ traits: { is_tor_exit_node: true } }).tor, true);
    assert.equal(parseMaxmind({ traits: { is_residential_proxy: true } }).residentialProxy, true);
    assert.equal(parseMaxmind({}).vpn, false);
  });

  await check('tor list parsing keeps valid addresses only', () => {
    const ips = parseTorList(
      '# comment\n185.220.101.1\n\n2a0b:f4c2::1\nnot-an-ip\n185.220.101.1\n999.1.1.1\n',
    );
    assert.deepEqual(ips.sort(), ['185.220.101.1', '2a0b:f4c2::1'].sort());
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
