# STEP 07 handoff - Onboarding, Tenant Settings, Team, KYC and Admin People

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 to 07).

## FEATURE_LIST items implemented (line ranges of SCOPE.md)

- Part 2 621-676 (sign-up follow-up, onboarding wizard, industry presets, first run): five-step wizard, six industry presets, progress checklist, milestones, guidance e-mails on days 1, 3, 7 and 14.
- Part 2 677-730 (company profile, branding, invoice settings): five settings screens, logo through the storage contract, numbering start, terms, notes, notification and display preferences (all money stays in US dollars).
- Part 2 731-783 (staff invitations, roles, activity, security): invitations with expiry, permission editor with presets, activity log, staff rules (two-factor, idle timeout, IP list), approval settings.
- Part 2 784-821 (KYC): four documents, owners, resubmission, reviewer queue, maker-checker approval, audited document views, expiry and renewal, `kyc` contract, screening hook.
- Part 2 822-835 (domains), 935-946 (tenant security policy), 947-953 (data backup, export, closure).
- Part 6 2767-2791 (J2 tickets, J3 feedback and NPS).
- Part 7 2814-2881 (admin home, users, tenants, communications), 3157-3179 (setup wizard), 3276-3302 (feature flag and configuration views).
- Part 11 4451-4470 (admin staff, shifts, sub-roles).
- Not built, with reasons (DECISIONS): restoring a backup into the live company (D17); a sanctions screening provider (D13); serving client pages on custom domains (D15); signing in through a single sign-on provider (D29); enforcing staff two-factor, idle timeout, IP list and password policy at sign-in (belongs to STEP 03, DEPENDENCY_REQUESTS); per-person time zones for shifts (D22); a dedicated plan key for several companies (D28).

## Migrations (S07_001 to S07_010, each with a `_down` file)

| File                   | Content                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| S07_001_company_settings | `company_settings`, `company_milestones`; `kd_company_setting_save`, `kd_milestone_record` |
| S07_002_team           | `team_invitations`; `kd_invitation_peek`, `kd_invitation_accept`                            |
| S07_003_kyc            | `kyc_submissions`, `kyc_documents`, `kyc_document_views`; `kd_kyc_duplicate_of`             |
| S07_004_kyc_review     | review columns of the KYC tables                                                            |
| S07_005_domains        | `custom_domains`                                                                            |
| S07_006_lifecycle      | `data_requests`; `kd_data_request_claim`                                                    |
| S07_007_admin_people   | `admin_actions`, `admin_notes`                                                              |
| S07_008_admin_ops      | `admin_shifts`, `announcements`, `platform_setup`; `kd_admin_shifts_replace`                |
| S07_009_support        | `support_tickets`, `support_messages`, sequence `support_ticket_seq`                        |
| S07_010_feedback       | `feedback_entries`, `feedback_prompts`; `kd_feedback_answered`, `kd_feedback_dismissed`     |

All tables have RLS enabled with default deny and are closed to `authenticated`, except the two ticket tables, which allow a company to select only its own rows (internal notes excluded).

## Contracts used and provided

Used: `tenant`, `audit`, `permissions`, `approval` (actions `kyc.approve`, `data.export`, `user.suspend`, `user.reactivate`, `tenant.suspend`, `tenant.reactivate`), `auth`, `security` (Turnstile), `storage` (categories `logo`, `kyc`, `export`), `encryption` (purpose `kyc`), `email`, `notification`, `entitlement`, `events`. Provided: `kyc` (`status`, `isVerified`), registered through `services/kyc/register.ts`.

## Config and environment

Permissions: `config/permissions/s07-{company,team,kyc,domain,data,admin,support}.ts`. Approval rules: `config/approval/s07-{kyc,lifecycle,admin}.ts`. Cron jobs: `kyc-sync` (15 minutes), `domain-check` (30 minutes), `lifecycle` (5 minutes), `admin-actions` (5 minutes), `support-sweep` (10 minutes). No new environment variables. Worker: `workers/onboarding/milestones.event.ts` (events `client.created`, `invoice.created`, `payment.captured`, `kyc.approved`). E-mail templates: `notification.onboarding-day-1/3/7/14`, `auth.team-invitation`.

## Pages and APIs

Company pages: `/onboarding`, `/settings/{company,branding,invoicing,notifications,display,kyc,domains,security,data,companies,sso}`, `/team`, `/team/security`, `/support`, `/support/new`, `/support/<id>`, `/feedback`, `/announcements`, `/join` (sign-in group, public).

Platform pages: `/admin` (home), `/admin/{users,tenants}` and their detail pages, `/admin/kyc`, `/admin/kyc/<id>`, `/admin/staff`, `/admin/announcements`, `/admin/feature-flags`, `/admin/setup`, `/admin/support`, `/admin/support/<id>`, `/admin/feedback`.

APIs: `/api/companies/{onboarding,logo,mine,admin/*}`, `/api/settings/{company/<section>,domains,data,data/download,sso}`, `/api/team/{members,invitations,invitations/accept,activity}`, `/api/kyc`, `/api/kyc/review`, `/api/kyc/review/<id>`, `/api/kyc/review/documents/<id>`, `/api/support/{tickets,tickets/<id>,admin/*}`, `/api/feedback`, `/api/announcements`.

## For other STEPs (requirements)

See DEPENDENCY_REQUESTS.md, section "For other STEPs". In short: STEP 03 enforces the stored staff and password rules and the first-sign-in two-factor setup of new platform staff; STEP 05 reads the notification section and the KYC events; STEPs 08 to 11 register their tables for export and gate money features with `kyc.isVerified`; the Integrator adds the plan key `company.multi` and mounts the notices banner and the feedback panel in the dashboard layout.

Reading a section from another STEP: `getSection(companyId, 'profile' | 'branding' | 'invoice' | 'display' | 'notifications' | 'security' | 'approval' | 'policy')` from `services/company/settings.ts`. Who is on duty for support: `onDutyNow('support_agent')` from `services/team/admin-staff.ts`.

## Owner steps (outside the code)

1. Sign in once as the super admin and complete `/admin/setup` (approval mode, e-mail sender, security overview).
2. Create the admin staff (`/admin/staff`), give each a sub-role (support agent, KYC reviewer, ...) and plan shifts so new tickets are assigned.
3. KYC: decide which screening provider to connect (a sanctions and anti-money-laundering service) and have its adapter written from the provider's own documentation; until then reviewers check by hand.
4. Custom domains: add each verified domain as an alias at the hosting provider.
5. Review the wording of the guidance e-mails and the support categories.

## Commits

07.1 to 07.12 on this branch; see `git log --oneline` (messages start with `feat(step07): 07.k`).
