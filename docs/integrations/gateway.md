# Sub-merchant gateway (STEP 16.12)

A main merchant lets its own sub-merchants call the main merchant's app through the platform. This note is for both sides.

## For the sub-merchant

Base address: `https://<platform>/api/gateway/v1`. Every call carries the key that the main merchant made for you:

```
GET /api/gateway/v1/orders/42?expand=items
Authorization: Bearer kd_sub_<32 characters>
Accept: application/json
Idempotency-Key: <16 to 128 characters, optional>
```

- Only the routes the main merchant listed work (a method and a path such as `GET /orders/{id}`). Anything else is `404`.
- Paths are plain: letters, digits and `. _ ~ -`, no encoding, no dot segments. A body is JSON and only for POST, PUT and PATCH (up to 1 MB).
- A wrong, revoked or expired key is `401` (the same answer for all three). A key may be limited to some addresses (`403`). A suspended or closed account is `403`. Too many requests are `429` with `Retry-After`; every answer carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `X-Correlation-Id`.
- You get the status and the body of the app for `2xx` and `4xx` (types `application/json`, `text/plain`, `text/csv`, `application/pdf`). When the app fails, answers with a redirect, a server error or another type, you get `502` (or `504` when it did not answer in time, `503` when the main merchant has not set it up or switched it off) with a platform error body; nothing of the app's own error text reaches you.

## For the main merchant (your app)

In the dashboard (`Integrations > Sub-merchant gateway`): save the address of your app, list the routes, add sub-merchants, make their keys. The signing secret (`gwsec_...`) is shown once when you save the address and again when you make a new one; the old secret works for 24 hours.

The platform calls your app with these headers and nothing else of the sub-merchant's request:

| Header | Meaning |
|---|---|
| `X-KD-Timestamp` | Unix seconds when the request was signed |
| `X-KD-Signature` | `t=<unix>,v1=<hmac>` (a second `v1=` while a rotated secret overlaps) |
| `X-KD-Sub-Merchant` | The reference you gave the sub-merchant |
| `X-KD-Sub-Merchant-Id` | The platform id of the sub-merchant |
| `X-KD-Correlation-Id` | Id to quote in a support case |
| `Content-Type`, `Accept`, `Idempotency-Key` | From the sub-merchant's request (checked) |

The signature is HMAC-SHA256 (hex) with your secret over this text:

```
<t>.<METHOD>.<path and query exactly as your app receives them>.<sha256 hex of the raw body>
```

Check it before you trust the request: compute it yourself, compare in constant time, and refuse a timestamp older than 5 minutes.

```js
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export function verifyGatewayRequest({ secret, signatureHeader, method, pathAndQuery, rawBody }) {
  const parts = signatureHeader.split(',');
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const expected = createHmac('sha256', secret)
    .update(`${t}.${method.toUpperCase()}.${pathAndQuery}.${bodyHash}`)
    .digest('hex');
  return parts
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const given = Buffer.from(p.slice(3), 'hex');
      const want = Buffer.from(expected, 'hex');
      return given.length === want.length && timingSafeEqual(given, want);
    });
}
```

Your app should also check `X-KD-Sub-Merchant` against what the route allows, and treat `Idempotency-Key` as the replay guard for writes. Answer in JSON; answers with a status of `3xx`, `5xx` or a type other than the four above are shown to the sub-merchant as `502`.

## What the platform keeps

One row per call (method, matched template, status, outcome, duration, byte counts, correlation id) in `gateway_calls` (append-only). Bodies and query values are never stored. Keys are stored as SHA-256 hashes; the signing secret is sealed with the company key.

## Limits

Up to 100 routes, 500 sub-merchants and 5 active keys per sub-merchant; 1 MB request and answer; 1 to 30 seconds wait for your app (default 15); https on port 443 only; the address of your app must be a host name that resolves to public addresses only (checked again when each connection opens) and must not be the platform itself.

## Not built

Onboarding or KYC of the sub-merchant itself, sharing of funds or settlement between the main merchant and its sub-merchants (financial and legal rules must be decided first), price or quota plans per route, a retention job for the call log, retries of failed calls (a failed call is answered at once; the sub-merchant may repeat it with the same `Idempotency-Key`).
