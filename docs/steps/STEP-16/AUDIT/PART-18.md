<!-- path: docs/steps/STEP-16/AUDIT/PART-18.md -->
# Audit part 18 of 41: features 1684 to 1782

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 59, some-match 26, generic-match 4, no-match 3, manual 7. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1684 | A2 | OTP cooldown 60 seconds | match | 13 | scripts/verify/step13-portal.ts |
| 1685 | A2 | OTP 3 tries lock | match | 13 | app/api/portal/otp/verify/route.ts |
| 1686 | A2 | owner sets password per link | match | 13 | app/(admin)/admin/users/[id]/page.tsx |
| 1687 | A2 | known client device remember 30 days | match | 13 | lib/cms/defaults/legal.ts |
| 1688 | A3 | Referrer-Policy no-referrer all token pages | match | 13 | scripts/verify/step04-core.ts |
| 1689 | A3 | rel noopener noreferrer | match | 13 | app/(public)/blog/[slug]/page.tsx |
| 1690 | A3 | CSP strict token pages only | match | 13 | scripts/verify/step04-core.ts |
| 1691 | A3 | X-Frame-Options DENY prevent iframe embedding | match | 13 | migrations/S16_025_embed_origins.sql |
| 1692 | A3 | Cache-Control no-store token pages | match | 13 | app/(client-portal)/p/[token]/payslip/[itemId]/route.ts |
| 1693 | A3 | Token page TLS only HSTS | match | 13 | scripts/verify/step04-core.ts |
| 1694 | A3 | disclaimer | no-match | 13 | - |
| 1695 | A4 | client asks for new link | match | 13 | services/payroll/portal.ts |
| 1696 | A4 | owner notification approve/deny | match | 13 | services/dispute/refund-requests.ts |
| 1697 | A4 | branded 404 | some-match | 13 | components/client/branded-portal-layout.tsx |
| 1698 | A4 | This link has been revoked | match | 13 | services/payroll/portal.ts |
| 1699 | B1 | owner s logo/colors | match | 13 | components/layout/public-shell.tsx |
| 1700 | B1 | logo company name invoice number | some-match | 13 | components/layout/sidebar.tsx |
| 1701 | B1 | Bill To Ship To | match | 13 | services/estimate/pdf.ts |
| 1702 | B1 | Qty Unit Price Amount | match | 13 | scripts/verify/step09-calc.ts |
| 1703 | B1 | Subtotal Tax Discount Shipping Total | match | 13 | services/invoice/invoices.ts |
| 1704 | B1 | Amount in Words | match | 13 | services/accounting/posting-rules.ts |
| 1705 | B1 | (Bengali only) | manual | 13 | - |
| 1706 | B1 | Remit To | some-match | 13 | sql/assertions/s08_009_supplier_bills.sql |
| 1707 | B1 | Tax ID EIN | match | 13 | lib/i18n/strings/en/s09-invoicing.ts |
| 1708 | B1 | Terms Conditions | match | 13 | scripts/verify/step16-settlement.ts |
| 1709 | B1 | client-visible only | some-match | 13 | migrations/S02_003_locks.sql |
| 1710 | B1 | Unpaid/Paid/Overdue/Partial | match | 13 | services/accounting/reports.ts |
| 1711 | B1 | sent viewed paid | match | 13 | config/s16-api.ts |
| 1712 | B1 | Download PDF branded snapshot | match | 13 | app/api/portal/pdf/route.ts |
| 1713 | B1 | Print Invoice print-optimized | some-match | 13 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 1714 | B1 | Pay Now prominent if unpaid | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 1715 | B1 | Contact Seller owner s email/phone | match | 13 | lib/i18n/strings/en/s09-invoicing.ts |
| 1716 | B1 | timestamp IP user agent | match | 13 | lib/integrations/webhook-rules.ts |
| 1717 | B1 | owner | manual | 13 | - |
| 1718 | B1 | (Bengali only) | manual | 13 | - |
| 1719 | B1 | token pages | some-match | 13 | services/payroll/register.ts |
| 1720 | B1 | English only per platform policy | match | 13 | lib/i18n/strings/en/s16-whatsapp.ts |
| 1721 | B2 | owner s logo/colors | match | 13 | components/layout/public-shell.tsx |
| 1722 | B2 | amount due date items summary | match | 13 | services/integration/automation.ts |
| 1723 | B2 | dynamic per tenant config | some-match | 13 | app/robots.ts |
| 1724 | B2 | Credit/Debit Card hosted fields PCI-safe | match | 13 | lib/credit/input.ts |
| 1725 | B2 | PayPal | match | 13 | lib/payment/adapters/paypal.ts |
| 1726 | B2 | Global Payout Partners country-specific | match | 13 | migrations/S14_003_payouts.sql |
| 1727 | B2 | Bank Transfer manual payment | match | 13 | services/payroll/run-rules.ts |
| 1728 | B2 | Apple Pay Google Pay mobile | match | 13 | lib/cms/defaults/support.ts |
| 1729 | B2 | BNPL if eligible | match | 13 | services/bnpl/offers.ts |
| 1730 | B2 | if owner allows | some-match | 13 | app/robots.ts |
| 1731 | B2 | terms refund policy mandatory | match | 13 | sql/assertions/s13_002_consents.sql |
| 1732 | B2 | Pay | some-match | 13 | services/payroll/run-rules.ts |
| 1733 | B2 | spinner Processing... | generic-match | 13 | components/ui/button.tsx |
| 1734 | B2 | Thank You confetti | generic-match | 13 | lib/ocr/extract-rules.ts |
| 1735 | B2 | error retry alternative method | match | 13 | lib/api/with-api.ts |
| 1736 | B2 | async methods We ll notify you | match | 13 | services/payroll/runs.ts |
| 1737 | B2 | post-payment instant | some-match | 13 | lib/integrations/mapping-rules.ts |
| 1738 | B2 | Pay another invoice client hub | match | 13 | services/portal/access.ts |
| 1739 | B2 | (Bengali only) | manual | 13 | - |
| 1740 | B2 | SSL mandatory | some-match | 13 | services/email/settings-store.ts |
| 1741 | B2 | 15 min session | match | 13 | services/fraud/signals.ts |
| 1742 | B3 | (Bengali only) | manual | 13 | - |
| 1743 | B3 | items pricing terms | match | 13 | lib/i18n/strings/en/s06-public.ts |
| 1744 | B3 | Approve client clicks to accept | match | 13 | components/gateway/kyc-forms.tsx |
| 1745 | B3 | Reject with reason field | match | 13 | services/payroll/run-rules.ts |
| 1746 | B3 | Request Changes with comment field | match | 13 | services/kyc/provider.ts |
| 1747 | B3 | optional draw signature | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 1748 | B3 | (Bengali only) | manual | 13 | - |
| 1749 | B3 | owner instant | some-match | 13 | lib/integrations/mapping-rules.ts |
| 1750 | B3 | IP device | some-match | 13 | migrations/S04_003_signals_down.sql |
| 1751 | B3 | immutable audit trail | generic-match | 13 | migrations/S05_006_email.sql |
| 1752 | B3 | on approval optional | match | 13 | lib/procurement/orders.ts |
| 1753 | B4 | token link | match | 13 | services/payroll/register.ts |
| 1754 | B4 | PDF | some-match | 13 | services/payroll/run-rules.ts |
| 1755 | B4 | (Bengali only) | manual | 13 | - |
| 1756 | B4 | re-send to self | some-match | 13 | scripts/verify/step16-automation.ts |
| 1757 | B4 | per client all receipts | some-match | 13 | cron/jobs/s16-ocr.ts |
| 1758 | B5 | unique per client all invoices | some-match | 13 | sql/assertions/s14_009_bnpl.sql |
| 1759 | B5 | branded list of all invoices | some-match | 13 | components/client/branded-portal-layout.tsx |
| 1760 | B5 | paid/unpaid/overdue | match | 13 | lib/payment/bnpl-rules.ts |
| 1761 | B5 | by number date amount | some-match | 13 | services/payroll/run-rules.ts |
| 1762 | B5 | total due total paid | match | 13 | services/bnpl/offers.ts |
| 1763 | B5 | Pay All Unpaid bulk payment | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 1764 | B5 | configurable | no-match | 13 | - |
| 1765 | B5 | owner generates new link | match | 13 | services/payroll/runs.ts |
| 1766 | B5 | IP device timestamp | match | 13 | scripts/verify/step04-core.ts |
| 1767 | C1 | PDF attachment payment link | match | 13 | app/api/storage/download/[token]/route.ts |
| 1768 | C1 | branded customizable | some-match | 13 | components/client/branded-portal-layout.tsx |
| 1769 | C1 | configurable | no-match | 13 | - |
| 1770 | C1 | HTML plain text | match | 13 | scripts/verify/step16-automation.ts |
| 1771 | C1 | View Invoice CTA | some-match | 13 | migrations/S06_007_marketing.sql |
| 1772 | C1 | Pay Now CTA | match | 13 | lib/cms/defaults/support.ts |
| 1773 | C1 | PDF auto | some-match | 13 | services/payroll/run-rules.ts |
| 1774 | C1 | due date highlight | generic-match | 13 | services/bnpl/offers.ts |
| 1775 | C1 | amount due prominent | match | 13 | services/bnpl/offers.ts |
| 1776 | C2 | before due 7d 3d 1d | some-match | 13 | services/bnpl/offers.ts |
| 1777 | C2 | after due 1d 7d 14d 30d | some-match | 13 | services/bnpl/offers.ts |
| 1778 | C2 | escalation | some-match | 13 | services/approval/queries.ts |
| 1779 | C2 | direct | some-match | 13 | services/accounting/report-rules.ts |
| 1780 | C2 | outstanding amount | match | 13 | sql/assertions/s09_017_client_hooks.sql |
| 1781 | C2 | late fee warning if applicable | match | 13 | lib/i18n/strings/en/s06-public.ts |
| 1782 | C3 | approval link | match | 13 | services/payroll/runs.ts |
