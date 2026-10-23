# STEP 16 - Blockers

## B1 Live writes through the public API (request R1)

Status: open. Found in: 16.1.b. Also affects 16.5 (order to client and invoice draft) and 16.10 (import).

The `clients` and `invoices` contracts have no create or update operation, and the `products` and `estimates` services have no contract at all. STEP 16 may not write into the tables of STEP 08 and 09 around their services, and it may not invent a contract. Until the Integrator answers R1 (see `DEPENDENCY_REQUESTS.md`):

- Live keys read clients, products, invoices, payments and estimates (complete).
- Sandbox keys also create test clients, products, invoices and estimates and change test clients and products (they work on the sandbox table only, so no contract is needed).
- A live key that calls a write endpoint gets `501` with the message "Writing live records through the API is not available yet. Use a sandbox key to try writes." The endpoints are listed in the OpenAPI document and marked "sandbox keys only for now".
- The payment link endpoint (`POST /invoices/{id}/payment-link`, feature 2119) is not built: it needs `invoices.createPaymentLink`, which is part of R1.

What unblocks it: the contract methods named in R1. Then the live branch of the five write handlers in `app/api/public/v1/**` calls them (the sandbox branch stays), and `requireSandbox` is removed.
