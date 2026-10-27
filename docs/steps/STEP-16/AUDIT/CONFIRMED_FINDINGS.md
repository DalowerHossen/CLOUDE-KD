<!-- path: docs/steps/STEP-16/AUDIT/CONFIRMED_FINDINGS.md -->
# Confirmed findings of the audit so far (2026-10-27)

Each item below was checked in the code or in the live database, not only searched. Ordered by what it breaks.

## 1. Almost no scheduled job runs

The code has 70 jobs (`cron/jobs`, listed in `cron/schedule.generated.ts`): recurring invoices, invoice reminders, late fees, overdue marking, client subscription billing, platform subscription renewals, dunning, payouts, payment webhook retries, worker ticks, report schedules, retention, estimate expiry, KYC sync, bank feed sync and more. Vercel Hobby cannot run them, and until 2026-10-27 nothing called them. Only `email-queue` is now scheduled from the database (16.28), and only after the owner stores `cron_secret`. Every feature that waits for a time (renewal reminders 715, recurring invoices 932 to 934, late fees 941, payouts, retries) does not happen on its own today.

## 2. Company security settings are saved but not enforced

`requireTwoFactor`, `staffSessionTimeoutMinutes`, `ipAllowlist`, `minPasswordLength`, `requireComplexity` and `loginNotifications` are stored in the company security section (`lib/company/sections.ts`) and read only by the settings form (`lib/company/forms.ts`). Nothing in the sign-in code reads them. STEP 07 recorded that this belongs to STEP 03; it was never done. Only `exportNeedsOwnerApproval` is enforced.

## 3. PDFs cannot show non-Latin text

`lib/pdf/shared/fonts.ts` embeds a Unicode font only when `PDF_FONT_DIR` holds `regular.ttf` and `bold.ttf`. There is no font file in the repository and the variable is empty, so invoices, receipts and payslips use Helvetica. A client or item name in Bengali, Hindi, Chinese or Arabic will not print.

## 4. E-mail does not leave

The live outbox holds messages waiting with the reason "No e-mail provider is set up (not set: SMTP_FROM)": the running deployment lacks `SMTP_FROM`.

## 5. Verification link lives one hour, not 24

`EMAIL_VERIFICATION_TTL_SECONDS` (86400) in `config/auth-lock.ts` is never used. The link is a Supabase one-time token, so its life is the Supabase "Email OTP expiration" setting (one hour by default).

## 6. Smaller facts

- Success toasts (146): `Toaster` is mounted but no code ever raises a toast.
- Custom domains (657): saved and checked, but client pages are not served on them (STEP 07 D15).
- Candidate gaps with no owner and no decision anywhere: 436, 1928, 2308, 2310, 2641, 3312, 3338, 3543, 3589, 3607, 3833, 3854, and the performance section 3357 to 3391 (see `CANDIDATE_GAPS.md`).
- The gaps the STEP owners recorded themselves are in `KNOWN_GAPS.md` (89 notes).
