# Custom - specification record

## 1. Sources read
There is no external provider: the custom adapter talks to an owner-defined HTTPS gateway. This record is the platform's own specification, taken from `docs/steps/STEP-12/SCOPE.md` (configuration-driven: base URL, authentication scheme, request and response field mapping, webhook signature scheme; no provider-specific behaviour; SSRF guard; test endpoint before enable), `docs/execution/PAYMENT_PROCESSORS.md` row 16, and the platform's own `lib/security/ssrf.ts` and `lib/payment/http-client.ts`. Nothing about any payment provider is assumed.

## 2. Authentication and credential fields
All settings are credential fields of the processor (saved per environment, secrets never shown again). Connection: `baseUrl` (https, public host, port 443, may carry a path prefix), `authScheme` (`none`, `bearer`, `basic`, `header`), `authHeaderName` (for `header`; default `X-API-Key`), `authSecret` (secret; the bearer token, the API key, or `user:password` for basic). Paths (each starts with `/`, no query, no `..`; `{id}` is replaced by the URL-encoded payment id): `testPath` (GET, required), `sessionPath` (POST, required), `lookupPath` (GET with `{id}`, required), `refundPath` (POST with `{id}`, optional). Request field names: `fieldAmount` (default `amount`), `fieldCurrency` (`currency`), `fieldReference` (`reference`), `fieldReturnUrl` (`return_url`), `fieldReason` (`reason`); `amountFormat` (`decimal_string` `"120.50"`, `decimal_number` `120.5`, `minor_number` `12050`). Response paths (dotted, array positions as numbers, for example `data.items.0.id`): `sessionUrlPath` (default `checkout_url`), `lookupIdPath` (`id`), `lookupStatusPath` (`status`), `lookupAmountPath` (`amount`), `lookupCurrencyPath` (`currency`), `lookupReferencePath` (`reference`, required: a payment without a matching reference is refused), `lookupCodePath` (optional decline code), `refundStatusPath` (`status`). Status words (comma separated): `statusPaid`, `statusPending`, `statusRefunded`, `statusVoided`, `refundDone`, `refundPending`. Webhook: `webhookSecret` (secret), `signatureHeader`, `signatureFormat` (`hmac_sha256_hex`, `hmac_sha256_base64`), `timestampHeader` (optional; the signed text is then `<timestamp>.<body>` and a timestamp more than five minutes off is refused), `eventIdPath`, `eventTypePath`, `eventPaymentPath`, and the event words `eventCaptured`, `eventFailed`, `eventRefunded`, `eventVoided`.

## 3. Environments
One base URL per saved environment; the platform makes no assumption about test mode on the gateway.

## 4. Secure form
Hosted: the gateway's session call returns a checkout address. The platform opens it in a new window (never inside the page) and the payer then types the payment reference shown by the gateway; only that reference is handed to the platform, which verifies it with the lookup call. No card data is typed on the platform's page (rule 3 of the form contract). The returned checkout address must be https, pass the SSRF static checks and be on the base URL's host or one of its sub-domains.

## 5. Operations (REST, JSON)
- Session: `POST sessionPath` `{ <fieldAmount>, <fieldCurrency>: "USD", <fieldReference>: <invoice id>, <fieldReturnUrl> }`; the answer must hold the checkout address at `sessionUrlPath`.
- Verify (`authorize` and `charge`): `GET lookupPath` with the payment id. The adapter requires the status to be one of `statusPaid`, the currency USD (when a path is set), the amount equal to the invoice amount, and the reference equal to the invoice id.
- Refund: `POST refundPath` `{ <fieldAmount>, <fieldReason> }`; `refundDone` = refunded, `refundPending` = pending, anything else = declined. Without `refundPath` a refund is refused (`REFUND_NOT_CONFIGURED`).
- Connection test: `GET testPath` must answer 2xx. The platform's mode switch requires a passing test before the processor is enabled.
- Every call sends an `Idempotency-Key` header (a hash of the platform key). All calls go through the SSRF-guarded client: https only, port 443, no credentials in the address, no private, loopback, link-local or reserved address (checked on the host name, on every DNS answer and again when the socket is opened), a timeout and a response size cap, and **redirects are not followed**.
- `processorTransactionId` is the gateway's payment id.

## 6. 3D Secure
Not modelled. `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
None: a generic gateway gives no card fingerprint, so duplicate-card checks cannot use this processor.

## 8. Decline mapping
Every refusal is `other`; the gateway's code (at `lookupCodePath`) is kept as the raw code only.

## 9. Webhooks
The configured header carries an HMAC-SHA256 (hex or Base64) of the raw body with `webhookSecret`. A delivery with no secret, no header or a wrong value is refused; a configured timestamp is checked. The adapter maps the configured event words and takes the id, type and payment id from the configured paths; without an event id it uses a hash of the body. It signs nothing it cannot verify.

## 10. Idempotency
The `Idempotency-Key` header is sent; whether the gateway honours it is the owner's responsibility (recorded as a known limit).

## 11. Test data
Owner-defined.

## 12. Limits and capabilities
`supportsAuthCapture` false (one step); `supportsThreeDS` false; `supportsRefund` true; `supportsPartialRefund` true; `supportsRecurring` false; `supportsPayout` false; not a merchant of record. Currency USD. No card identity.

## 12a. Content security policy
No origin is added: the platform page loads nothing from the gateway; the checkout opens in a new window.

## 13. Open questions
None for the adapter. The owner confirms that the gateway returns the reference, supports the idempotency header and can sign webhooks in one of the two formats.
