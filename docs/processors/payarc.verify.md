# PayArc - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-payarc.ts` -> 16 checks passed. A fake HTTP transport answers with the shapes of PayArc's OpenAPI definitions and documentation (docs/processors/payarc.md). It proves:
- contract and credential field patterns; USD only; `supportsThreeDS: false`;
- checkout session: only the client id, the sandbox script address and the display amount; no token in the client data; a live account and a missing client id are refused (blocker B3);
- request key: a fixed 40-character digest of the core's key;
- authorize: the exact `POST /v1/charges` body (cents as an integer, `usd`, `token_id`, `capture: 0`, invoice in `metadata`), bearer and idempotency headers, sandbox host; result mapping (charge id, status, identity from the fingerprint, postal check, 3DS fields all false); malformed tokens refused before any call; 401 throws a credential error without the token text; 5xx and 429 throw; a validation error (422) is a decline `VALIDATION`; eight response codes map to the platform categories; a refusal with only a message maps through the text; a charge that is already captured and a partial approval (released with a void and refused) are handled;
- capture: reads the charge first, only the full authorized amount is captured, an already captured charge is returned without a call, a concurrent capture (409) is re-read as captured, an unclear answer is checked again and otherwise reported as pending, a refusal is a decline;
- void: only an uncaptured authorization; an already voided charge is returned without a call; a captured one is refused; "Reversal Not Allowed." is a decline;
- refund: batched charge -> `POST /refunds` (cents, reason, description only when 5 characters or longer), result under the newest listed refund id, a `Refund` object as the answer, a failed refund, an answer without a list; before batching ("Return Not Allowed.") a full refund is a void reported as `refunded`, a partial refund is refused; not captured, too large and unknown cases;
- charge states, card identity (fingerprint, else `first6|last4|brand|expiry`), postal check, lookup;
- decline mapping (15 cases, case-insensitive), connection test (success, 401, 503, 404, live host);
- webhooks: every delivery is refused whatever the headers, mapped to `unknown` with no transaction id, event id a digest of the body (blocker B2).

## B. Sandbox scenarios (NOT run: no PayArc sandbox credentials in this environment)
Nothing below is claimed as passed. With a PayArc merchant sandbox (client id and API bearer token from the sandbox dashboard, requested from support@payarc.com), run these and record the charge ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong or production token | ok / message without the token | pending |
| Hosted Fields load | sandbox page with the CSP on | script and four frames render; record every host the frames load (open question 2) and whether jQuery is needed | pending |
| token | Visa 4012 0000 9876 5439, 12/29, 999, ZIP 85284 | token id returned by the success callback | pending |
| authorize | token, amount 1.00 | `authorized`, `captured: 0`; identity from `card.data.fingerprint`; record `avs_status`, `zip_check_passed` | pending |
| capture | the authorization | `captured` (`submitted_for_settlement`) | pending |
| minimum amount | amount 0.49 | refused (minimum 0.50) | pending |
| declines | other test cards; wrong security code (998 on Visa) | record the HTTP status and body of a decline, `failure_code` and the status text (open question 3) | pending |
| idempotency | the same key twice | one charge, the same answer | pending |
| void | authorize, then void the same day | `voided` (`void`) | pending |
| refund before batching | capture, then refund the full amount at once | "Return Not Allowed." then void -> `refunded` | pending |
| refund after batching | next day, partial 0.25 then the rest | `refunded`; record the answer (open question 4) | pending |
| uncaptured expiry | observe an authorization after 7 days | expired | pending |
| webhook endpoint | add the platform URL in the dashboard | NOT to be done until B2 is resolved | blocked |

## C. Known limits
- Webhooks cannot be authenticated (B2): they are refused. Payments are confirmed by the server reading the charge back.
- The production Hosted Fields address is unknown (B3): live accounts get no checkout session until it is added.
- No 3D Secure (PayArc supports it only for Traditional merchants with a separate 3DS provider).
- A capture is always for the full authorized amount; a void works only the same day; a refund works only after batching (a full refund before that is a void).
- A repeated refund request cannot be detected (no idempotency header is documented for refunds).
- The decline answer, the refund answer and the AVS codes are inferred from the documented shapes and must be confirmed in the sandbox.
