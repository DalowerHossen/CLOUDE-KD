# STEP 07 dependency requests

No new packages. STEP 07 uses packages already in `package.json` (`sharp` for the image size check of KYC photos and the logo, `zod`, `@react-email/components`).

## For the Integrator (shared files; items 1 to 4 are already changed in this branch)

1. `config/ownership.json`: STEP 07 patterns added: `lib/{company,team,kyc,support,lifecycle,domain,helpdesk}/**`, `app/(dashboard)/{announcements,feedback}/**`, `app/api/{announcements,feedback}/**`, `app/(admin)/admin/{announcements,feedback,_components}/**`, `app/(auth)/join/**`, `components/{support,feedback}/**`, `workers/onboarding/**`. Please also add them to `docs/execution/OWNERSHIP_MAP.md` row 07. `lib/support/**` is STEP 06 (status page), so the ticket rules live in `lib/helpdesk/`.
2. `emails/catalog.ts`: one line importing `onboardingEmailTemplates` (templates `notification.onboarding-day-1/3/7/14`, `auth.team-invitation`).
3. `scripts/verify/step04-static.mjs`: plain-handler allow list extended for the binary routes `app/api/companies/logo`, `app/api/kyc/review/documents` and `app/api/settings/data/download`.
4. Generated files changed by `npm run gen`: `config/nav-map.ts`, `config/permissions.ts`, `config/approval-rules.generated.ts`, `cron/schedule.generated.ts`, `lib/bootstrap.generated.ts`, `lib/i18n/strings/en.ts`, `services/jobs/handlers.generated.ts`.
5. `scripts/integration-check.sh`: add `npx tsx scripts/verify/step07-core.ts`.
6. `config/plans.ts` (STEP 02/14): add the entitlement key `company.multi` (enterprise only). Until then several companies and the company switcher use `sso.ready` (enterprise only). After the key exists, replace the three uses (`config/nav/s07.ts` item `settings-companies`, `app/(dashboard)/settings/companies/page.tsx`, `services/company/companies.ts`).
7. Shared dashboard layout (STEP 01 shell): show (a) the live announcements banner (`GET /api/announcements`, page `/announcements`) and (b) the satisfaction question (`GET /api/feedback` answers `{ due }`; component `components/feedback/feedback-panel.tsx`). Both are optional; the pages work without the banner.
8. Hosting (Netlify or VPS): a verified custom domain must also be added as a domain alias of the site, and the hosting platform issues the certificate. `companyForHost(hostname)` in `services/domain/domains.ts` answers which company owns a verified host; the proxy chain must call it (see DECISIONS D15).

## For other STEPs

- STEP 03: enforce the settings that STEP 07 stores. Read them with `getSection(companyId, 'security')` (`requireTwoFactor`, `staffSessionTimeoutMinutes`, `ipAllowlist`; staff only, never the owner) and `getSection(companyId, 'policy')` (`minPasswordLength`, `requireComplexity`, `loginNotifications`). Platform staff created by the super admin (`services/team/admin-staff.ts`) must be forced to set up two-factor sign-in at the first sign-in. Single sign-on itself (SAML or OpenID Connect sign-in using the `sso` section, only after the platform activates it) is an authentication feature that needs the provider documentation; STEP 07 only stores the settings and takes the activation request.
- STEP 05: read `getSection(companyId, 'notifications')` to choose recipients and the summary mail. Turn `kyc.approved`, `kyc.rejected` events into notifications (the payload carries the reason shown to the owner). Notifications created by STEP 07 use types `support.*`, `team.joined`.
- STEPs 08 to 11: call `registerTenantExport(...)` from `lib/lifecycle/registry.ts` for each tenant table so the owner's export and backup contain it (columns that look secret are refused); call `recordMilestone(companyId, 'client_created' | ...)` where listed in the HANDOFF; use `getService('kyc').isVerified(companyId)` to gate merchant-of-record, payouts and limits.
- STEP 09: the invoice settings section stores only where numbering starts (`invoice.nextNumber`); the invoice STEP owns the running counter.
- STEP 14: price source and the plan keys of item 6.
