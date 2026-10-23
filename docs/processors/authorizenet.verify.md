# Authorize.Net - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-authorizenet.ts` -> 13 checks passed. A fake HTTP transport answers with the shapes of Authorize.Net's API reference (docs/processors/authorizenet.md). It proves:
- checkout session: only public data (API Login ID, Public Client Key, script address for the environment); missing values refused; no Transaction Key in the client data;
- authorize: the exact JSON request with the elements **in the schema's order** (`merchantAuthentication`, `refId`, `transactionRequest`: transactionType, amount, payment, order, customerIP), the nonce split into `dataDescriptor` and `dataValue`, two-decimal amount, invoice number of at most 20 characters, IPv4 sent and IPv6 not sent, `refId` = 20 characters derived from the core's key; result mapping (status, transaction id, AVS true / false / unknown, **no card identity**, 3DS fields all false);
- declines: 14 reason codes mapped to the platform categories (card code 44 / 45 / 65, expiry, number, fraud filters, processor errors, AVS mismatch and duplicate as `other`); `responseCode` 3 as an error; `responseCode` 4 (held for review) as **pending** with the transaction id kept;
- credentials and outages: the four authentication message codes (E00006, E00007, E00008, E00010) throw a validation error that names the credentials; HTTP 5xx and a non-JSON answer throw; a byte order mark in front of the JSON is stripped; nonce shape checks before any call;
- capture (exact request, id kept as the payment handle), void (including 310 "already voided" read as success), refund of a settled payment (last four digits read from the masked number, `XXXX` expiry, own refund id returned), refund of a payment still `capturedPendingSettlement` (full amount becomes a void, a partial amount is refused with a clear reason), refusal of other states, missing card digits, unknown transaction; status lookup for ten states;
- connection test with `authenticateTestRequest` (failure messages never contain the key);
- webhooks: HMAC-SHA512 of the raw body; accepted with or without `sha512=`, in either letter case, with the key as text or as the bytes of a hexadecimal string; refusal of a wrong key, a changed body, a short or empty value, a missing header, an empty body and missing credentials **without** any call to Authorize.Net; mapping of nine payment events, `notificationId` as the event id, transaction id from `payload.id` (text or number, shape checked), non-transaction payloads.

## B. Sandbox scenarios (NOT run: no Authorize.Net credentials, and the API hosts are not reachable from this environment)
`apitest.authorize.net` and `api.authorize.net` are refused by this environment's network policy (checked: connection rejected), so a sandbox run needs both a sandbox account (API Login ID, Transaction Key, Public Client Key, Signature Key) and network access to the sandbox host. Nothing below is claimed as passed:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong Transaction Key | ok / message without the key | pending |
| JSON order accepted | any authorize | accepted (no schema-order error) | pending |
| answer format | observe the raw answer | JSON; with or without a byte order mark | pending |
| success + capture | AcceptUI form, card 4111111111111111 | authorized, then captured (`capturedPendingSettlement`) | pending |
| AVS | postal codes `46201` (A), `46217` (Z), `46205` (N), `46203` (E) | postal match false / true / false / unknown | pending |
| declines | postal code `46282` (decline); card codes `901` (N) | `do_not_honor`; card code result `N` (a decline only when the account's filter is on) | pending |
| held for review | an account with a fraud filter set to hold | `pending`, `rawCode` of the message | pending |
| void | authorize, then void from the review page | `voided` | pending |
| refund before settlement | capture, then refund the full amount at once | done as a void, `refunded` | pending |
| refund after settlement | wait for settlement (up to 24 hours), refund 25.00 and the rest | `refunded`; check that `getTransactionDetails` returns the last four digits | pending |
| duplicate | send the same authorize twice within two minutes | second answer reason `11`, reported as a failed payment | pending |
| webhook valid / invalid | webhook on the platform URL (event types above), forged copy | processed / 401 + security event; record the real `X-ANET-Signature` form and the key form that matched | pending |
| duplicate webhook | resend the same notification | processed once (`notificationId`) | pending |
| webhook for refund | refund a settled payment | the event carries the refund's own transaction id; the core asks the processor | pending |
| lightbox | open the AcceptUI lightbox twice in one page visit | works both times (script reload) | pending |
| CSP | load the payment page with the policy on | the lightbox and its requests are not blocked; record the real origins | pending |

## C. Known limits
- **No 3D Secure** (the API's authentication fields are deprecated): `supportsThreeDS: false`.
- **No card identity**: Authorize.Net returns only the masked number and brand, so the identity-based rules (blacklist, per-card limits) do not apply to this processor.
- **No idempotency key**: the duplicate check (two minutes by default) and `refId` are the only protections; a request that timed out after being accepted can leave an authorization that the retry reports as a duplicate (it expires after 30 days).
- A partial refund is possible only after settlement (within 24 hours of capture).
- Authorize.Net's detailed issuer reasons (for example insufficient funds) are not passed on, so most declines map to `do_not_honor`.
