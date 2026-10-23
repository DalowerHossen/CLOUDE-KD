# STEP 16 - Blockers

## B1 Live writes through the public API (request R1)

Status: open. Found in: 16.1.b. Also affects 16.5 (order to client and invoice draft) and 16.10 (import).

The `clients` and `invoices` contracts have no create or update operation, and the `products` and `estimates` services have no contract at all. STEP 16 may not write into the tables of STEP 08 and 09 around their services, and it may not invent a contract. Until the Integrator answers R1 (see `DEPENDENCY_REQUESTS.md`):

- Live keys read clients, products, invoices, payments and estimates (complete).
- Sandbox keys also create test clients, products, invoices and estimates and change test clients and products (they work on the sandbox table only, so no contract is needed).
- A live key that calls a write endpoint gets `501` with the message "Writing live records through the API is not available yet. Use a sandbox key to try writes." The endpoints are listed in the OpenAPI document and marked "sandbox keys only for now".
- The payment link endpoint (`POST /invoices/{id}/payment-link`, feature 2119) is not built: it needs `invoices.createPaymentLink`, which is part of R1.

What unblocks it: the contract methods named in R1. Then the live branch of the five write handlers in `app/api/public/v1/**` calls them (the sandbox branch stays), and `requireSandbox` is removed.

## B2 Meta Cloud API documentation cannot be reached (16.3.a, and with it 16.3.b and 16.9)

Status: RESOLVED on 2026-10-23 (the host became reachable with `curl`; see the note at the end). Found in: 16.3.a (2026-10-23).

The rule for every external provider of this STEP (SUBSTEPS.md, "Provider documentation rule") is to read the provider's latest official documentation in the session before any adapter code, and to stop the sub-step when it cannot be reached. `developers.facebook.com` is not reachable from this environment: `WebFetch` fails with `getaddrinfo ENOTFOUND developers.facebook.com` for three pages (send messages, webhook components, get started), and `curl` through the session proxy fails with `CONNECT tunnel failed, response 403`, so the host is blocked by the environment's network policy. A web search returned only third-party summaries (it names a Graph API version of v23.0 in the official get-started page and the template and 24 hour window rules), which are not the official documentation and are not enough to write the client, the webhook payload parsing or the template submission calls.

No WhatsApp code was written. What unblocks it: allow the host `developers.facebook.com` (and `graph.facebook.com` for later live tests) in the environment's network policy (documentation: `read_documentation` topic `environment.network`), then run 16.3.a again; or the owner pastes the needed pages of the official documentation into the session. The same host is needed for the Instagram, Facebook and Threads adapters of 16.4.a.

Resolution (2026-10-23): after the owner changed the network access, `curl` reached `developers.facebook.com` (HTTP 200) and the official pages were read as markdown by adding `.md` to their address (for example `https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages.md`). The `WebFetch` tool still cannot resolve that host (`ENOTFOUND`), so provider documentation is read with `curl` through the session proxy. `graph.facebook.com`, `shopify.dev`, `woocommerce.github.io`, `developer.woocommerce.com`, `plaid.com` and `docs.saltedge.com` were still blocked when tested; `cloud.google.com` answered 200. The Shopify, WooCommerce, Plaid and Salt Edge sub-steps (16.5, 16.7) need those hosts allowed before they start. Live calls to Meta (`graph.facebook.com`) are not possible from this environment, so nothing was sent to Meta.
