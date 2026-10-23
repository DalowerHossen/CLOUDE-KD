# Payoneer - documentation record (NOT written: official documentation unreachable, see STEP 12 blocker B6)

## 1. Sources read
Tried in this session on 2026-10-18 (UTC): `developer.payoneer.com` answers only a redirect stub (a script that sends the browser to a payoneer.com error page, and `/psd2` which redirects to a host that does not resolve); `/llms.txt`, `/docs`, `/reference` and every guessed documentation path return 404; `www.payoneer.com`, `payoneer.com`, `docs.payoneer.com`, `checkoutdocs.payoneer.com` and the checkout API hosts are refused by the network policy of this environment; GitHub pages of the vendor are refused and `raw.githubusercontent.com` holds no Payoneer repository that could be found by name. The only npm results for "payoneer" are unofficial packages, which are not a source (rule 8). **No page of Payoneer's own documentation was read.**

## 2. Authentication and credential fields
Not read. Nothing is written.

## 3. Environments
Not read.

## 4. Secure form
Not read. Payoneer offers more than one product (a hosted checkout for accepting payments and a payout product); which one applies to "accept an invoice payment" and which form (hosted page, iframe or SDK) it uses could not be established.

## 5. Operations
Not read.

## 6. 3D Secure
Not read.

## 7. Card identity (REQ-CARD)
Not read.

## 8. Decline mapping
Not read.

## 9. Webhooks
Not read. The route is not created: an unauthenticated webhook route must never exist (the platform's rule is fail-closed).

## 10. Idempotency
Not read.

## 11. Test data
Not read.

## 12. Limits and capabilities
No adapter exists, so the checkout shows "unavailable" for Payoneer. Nothing in the platform lists it as usable.

## 13. Open questions
Everything in sections 2 to 11. The blocker lists what is needed to continue.
