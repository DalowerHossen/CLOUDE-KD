# STEP 07 - Onboarding, Tenant Settings, Team, KYC and Admin People

Wave C. Depends on: STEPs 01 to 05 contracts. Contract use: tenant, audit, permissions, approval, auth, security, storage, email, notification, entitlement. Provides contract: kyc.

## Feature sources

- Part 2 lines 621-676 (C signup flow, onboarding wizard, industry presets, first run), 677-730 (D company profile, branding settings, invoice settings), 731-783 (E staff invite, roles, activity, security), 784-821 (F KYC upload, review, gated features), 822-835 (G domain), 935-946 (K tenant security policy), 947-953 (L data backup and export)
- Part 6 lines 2767-2791 (J2 tickets, J3 feedback and NPS)
- Part 7 lines 2814-2881 (A admin dashboard, users, tenants, communications), 3157-3179 (H setup wizard), 3276-3302 (L jobs and config management views)
- Part 9 lines 4181-4201 (Q enterprise and B2B)
- Part 10 lines 4387-4408 (G customer lifecycle and offboarding)
- Part 11 lines 4451-4470 (admin_staff shifts and permission matrix UI)

## Owned paths and migrations

OWNERSHIP_MAP.md rows 07 and section 4. Migration block `S07_*`.

## Sub-steps

- 07.1 Onboarding wizard: company creation, industry presets, logo and colors, invoice defaults, first client prompt, progress checklist, empty-state guidance, achievement milestones.
- 07.2 Company settings: profile, legal and tax identifiers, addresses, contacts, branding (logo via storage contract, colors, fonts), invoice settings (number format inputs, terms, notes, due defaults), notification preferences UI, localization display settings (UI stays English).
- 07.3 Team: invitations by email with expiry, staff roles and granular permission editor (resource x action), staff activity log view, staff security (enforce 2FA, session list and revoke, IP allowlist), approval workflow settings for staff-draft actions.
- 07.4 KYC (owner side): upload of ID front and back, business and address documents through the storage contract, status tracking, resubmission, KYC-gated feature flags, `kyc` contract implementation.
- 07.5 KYC review (admin side): `(admin)/admin/kyc` queue for `kyc_reviewer`, CEO final approval through the approval engine, reasons and notifications, document access audit, AML and sanctions screening hook through the security contract.
- 07.6 Domains: custom domain setup, DNS verification records, status, plan gating through entitlement.
- 07.7 Tenant policy and data tools: security policy settings, session timeout, data export request, backup request, account closure and offboarding flow.
- 07.8 Admin people: admin home page `/admin` (platform overview), users list and detail, tenants list and detail, suspend and reactivate (through approval), admin_staff management and shifts, impersonation entry button (uses STEP 03 flow), broadcast messages, feature-flag manager UI, super-admin first-login setup wizard (solo mode choice, SMTP, security defaults).
- 07.9 Support: tenant support pages, ticket create and thread, admin queue for `support_agent`, SLA timers, feedback and NPS prompts, enterprise and B2B items (multi-company switcher, SSO readiness settings as listed).
- 07.10 Nav and permission fragments for all pages of this STEP; email templates for invitations, onboarding, KYC results.

## Security notes

Invitation tokens are single use and hashed. KYC documents never leave the storage contract. Staff cannot raise their own permissions. Every settings write is optimistic-locked and audited.

## Verification

Wizard completes on 320 px; invitation expiry works; a staff member without permission gets 403 on the API and no menu item; KYC document shows only to permitted reviewers and each view is audited; CEO approval needed before KYC becomes verified; domain verification state changes correctly.

## Handoff must list

Settings keys, permissions registered, KYC states, pages.
