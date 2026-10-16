# Leaked access link

Trigger: alert `security.token_abuse`, a token seen from more than five addresses in 24 hours (the system revokes it itself), or a customer reports a forwarded link.

1. Find the document the link belongs to (invoice, estimate or client hub). The token event history shows first use, addresses (masked) and failed one-time code attempts.
2. Revoke the token if the system has not already. A revoked link shows a neutral "not available" page.
3. Issue a new link with a shorter lifetime (7 days) and one-time code protection turned on, and send it to the client.
4. If the document holds sensitive data, ask the owner to confirm with the client that the earlier link was not shared on purpose.
5. If many tokens are affected, treat it as a possible secret leak: rotate `HMAC_TOKEN_SECRET`. All earlier links stop working; reissue them after the rotation.

Recovery check: no new token events for the revoked token, the new link opens only after the one-time code.
