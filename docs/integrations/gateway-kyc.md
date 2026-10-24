# Sub-merchant KYC (STEP 16.13)

A main merchant verifies each of its sub-merchants before the gateway lets the sub-merchant call the main merchant's app (setting `Require verification`, on by default). The sub-merchant has no login.

## Flow

1. **Link.** In `Integrations > Sub-merchant gateway`, the owner opens a sub-merchant and chooses `Make verification link` (1 to 30 days, needs a fresh identity check). The link `https://<platform>/skyc/<40 characters>` is shown once; only its hash is kept. A new link replaces the earlier ones. The owner sends the link to the sub-merchant by any channel.
2. **Application.** The sub-merchant opens the link (no login; VPN, proxy and Tor are refused as for every KYC page) and gives the business name and country, up to six owners (name, birth date, nationality, ownership percent, ID number; sealed with the company key) and four documents (ID front, ID back, business registration, address proof; JPEG, PNG, WebP or PDF up to 5 MB; photos at least 600 by 400 pixels). The documents are stored encrypted under the main merchant's company and are never shown back to the applicant. Then the sub-merchant submits.
3. **Review.** The owner opens the case (`Integrations > Sub-merchant gateway > Verification`). `Start the review` runs the screening: the business name and every owner are checked against the imported OFAC and UN sanctions lists, and the business country and the owners' nationalities against the country restrictions of the platform. Every look at a document is written to the audit log before the file is read. The owner accepts or rejects each document (a reason is needed for a rejection), sets a risk level and an internal note, and then approves, asks for changes (needs a rejected document and a reason) or rejects (needs a reason).
4. **Approval.** Valid for two years (`kyc_approved_until` of the sub-merchant). A rejection clears it. After it ends, or when the sub-merchant is suspended or closed, the gateway answers 403. A sub-merchant can start a new round in the last 30 days of its approval; the old approval stays valid until it ends.

## Rules the main merchant cannot bend

- A screening result with matches cannot be approved. The owner can only reject or ask for changes.
- When no list is imported or the check could not finish, approval needs the owner's written confirmation that every name was checked by hand; it is recorded in the audit entry. This control is only as strong as that confirmation.
- A decision needs a fresh identity check (15 minutes). All steps are audited (`gateway.kyc_*`).

## Limits

The platform does not review the cases of its merchants' sub-merchants and cannot override a match; the platform does not re-screen when a list changes; the link is copied by the owner (it is not e-mailed by the platform); the platform does not watch a sub-merchant's own volume or disputes; and who is legally responsible for a sub-merchant is a matter for the contract between the platform, the main merchant and counsel, not for this software.
