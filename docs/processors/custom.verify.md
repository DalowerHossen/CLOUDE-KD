# Custom - verification record

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-custom.ts` -> 13 checks passed. A fake guarded transport answers; it is installed after the address checks, so the static SSRF checks run for real. It proves:
- contract: one-step hosted gateway, USD only, no card identity, credential field patterns;
- SSRF: a base address that is http, localhost, a private, loopback, link-local or metadata address (IPv4 and IPv6), a decimal or short IPv4 spelling, one with credentials, a port other than 443, or an internal or `.local` name is refused before any call; the platform guard refuses literal private addresses and accepts a public one;
- paths: a path with `..`, a double slash, a full address, a query, a fragment, no leading slash, or `{id}` without an id is refused before any call; a payment reference with unsafe characters is refused; a malformed response path setting is refused;
- redirects: a 3xx answer is refused, not followed;
- authentication: bearer, basic (secret containing colons), custom header and none; a missing secret or an unknown scheme is refused; 401 is reported without the secret; 5xx is an error;
- session: the exact request in the three amount formats (string, bare number, minor units) with custom field names, the idempotency header (hashed), and the returned checkout address must be https, public, and on the gateway host or a sub-domain (another host, http, a private address, a look-alike suffix and an empty answer are refused);
- `charge` and `authorize`: default and custom response paths and status words, reference, currency and amount all checked; pending, failed, other amount, other currency, other or missing reference, missing or malformed amount, unknown payment are refused;
- refund: done, pending, rejected, API refusal, too large, not configured, already refunded, not paid;
- webhooks: hex and Base64 HMAC-SHA256 of the raw body, an optional signed timestamp with a five-minute window; wrong secret, changed body, missing or empty header, empty body, missing secret or header name, wrong format and a stale or missing timestamp are refused; event mapping for the fixed neutral body shape and a body-hash event id.

## B. Owner scenarios (NOT run: there is no owner gateway in this environment)
Nothing below is claimed as passed. With the owner's gateway run these and record the results here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| test endpoint | the configured `testPath` | 2xx; processor can be enabled only after a pass | pending |
| session | USD invoice 1.50 | checkout address on the gateway host | pending |
| payment verified | pay in the hosted page, type the reference | `charge` returns `captured`; reference, currency and amount match | pending |
| wrong reference | another payment's reference | refused (`PAYMENT_MISMATCH`) | pending |
| refund whole / part | paid payment | refund call accepted; status words recorded | pending |
| webhook valid / invalid | signed event; forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend | processed once (event id) | pending |
| idempotency | repeat a session call with the same key | gateway returns the same session or documents otherwise | pending |
| DNS and connect-time guard | a host name that resolves to a private address | refused by the guard | pending |

## C. Known limits
- Hosted flow only: the payer types the gateway's payment reference back (a return route would remove the step: STEP 12 request R4).
- Webhook bodies must have the fixed neutral shape; only the signature scheme is configurable (the adapter interface gives the parser no access to saved settings).
- The gateway must return the invoice reference in its lookup answer; a payment without a matching reference is always refused.
- No card identity, no 3D Secure, no decline categories (every refusal is `other`).
- Whether the gateway honours the `Idempotency-Key` header is the owner's responsibility.
- The DNS and connect-time checks belong to `lib/security/ssrf.ts` and need real network access to exercise end to end.
