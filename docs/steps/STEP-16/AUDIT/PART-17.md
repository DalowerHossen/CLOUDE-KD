<!-- path: docs/steps/STEP-16/AUDIT/PART-17.md -->
# Audit part 17 of 41: features 1585 to 1683

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 39, some-match 32, generic-match 6, no-match 1, manual 21. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1585 | I2 | owner marks delivered | match | 11,13 | services/accounting/posting.ts |
| 1586 | I2 | client confirms | some-match | 11,13 | app/(dashboard)/migration/[id]/page.tsx |
| 1587 | I2 | optional on delivery | match | 11,13 | services/siem/siem-service.ts |
| 1588 | I2 | pre-work proof | match | 11,13 | services/contract/library.ts |
| 1589 | I2 | owner Google Drive | match | 11,13 | migrations/S05_003_storage_adapters.sql |
| 1590 | I2 | physical goods | generic-match | 11,13 | services/product/variants.ts |
| 1591 | I2 | (Bengali only) | manual | 11,13 | - |
| 1592 | I2 | token link click | match | 11,13 | app/api/email/unsubscribe/[token]/route.ts |
| 1593 | I3 | message-id timestamp | some-match | 11,13 | migrations/S08_006_valuation.sql |
| 1594 | I3 | SMTP response | match | 11,13 | lib/i18n/strings/en/s07-company.ts |
| 1595 | I3 | pixel tracking | match | 11,13 | migrations/S05_006_email.sql |
| 1596 | I3 | IP | manual | 11,13 | - |
| 1597 | I3 | (Bengali only) | manual | 11,13 | - |
| 1598 | I3 | per invoice | manual | 11,13 | - |
| 1599 | I3 | tamper-proof blockchain-style | match | 11,13 | lib/pdf/evidence-pack-pdf.tsx |
| 1600 | I3 | PDF at send time | some-match | 11,13 | services/payroll/run-rules.ts |
| 1601 | J1 | per tenant | manual | 12,14 | - |
| 1602 | J1 | monthly/yearly | match | 12,14 | app/(dashboard)/subscriptions/plans/page.tsx |
| 1603 | J1 | display | manual | 12,14 | - |
| 1604 | J1 | optional | some-match | 12,14 | services/payroll/run-rules.ts |
| 1605 | J1 | per seat/usage | match | 12,14 | migrations/S14_005_plans.sql |
| 1606 | J2 | cron | some-match | 12,14 | cron/jobs/s09-overdue.ts |
| 1607 | J2 | token at client record mandate consent | match | 12,14 | services/storage/drive-link.ts |
| 1608 | J2 | mandate via email | some-match | 12,14 | scripts/verify/step11-stripe.ts |
| 1609 | J2 | per cycle | some-match | 12,14 | app/(dashboard)/subscriptions/page.tsx |
| 1610 | J2 | (Bengali only) | manual | 12,14 | - |
| 1611 | J2 | 3 attempts exponential backoff | match | 12,14 | lib/storage/adapters/base.ts |
| 1612 | J2 | owner client | manual | 12,14 | - |
| 1613 | J3 | Pause Resume Cancel owner or client self-service | match | 12,14 | app/(dashboard)/subscriptions/[id]/page.tsx |
| 1614 | J3 | mid-cycle upgrade/downgrade | match | 12,14 | scripts/verify/step14-client-subscriptions.ts |
| 1615 | J3 | prorated | some-match | 12,14 | scripts/verify/step14-client-subscriptions.ts |
| 1616 | J3 | (Bengali only) | manual | 12,14 | - |
| 1617 | J3 | before cycle end | some-match | 12,14 | app/(dashboard)/subscriptions/page.tsx |
| 1618 | J3 | MRR per tenant | some-match | 12,14 | lib/payment/client-subscription-rules.ts |
| 1619 | J3 | (Bengali only) | manual | 12,14 | - |
| 1620 | J3 | LTV | some-match | 12,14 | app/(dashboard)/subscriptions/page.tsx |
| 1621 | K1 | Klarna/Afterpay- | no-match | 12,14 | - |
| 1622 | K1 | BNPL eligible invoices only | match | 12,14 | services/bnpl/offers.ts |
| 1623 | K1 | soft credit check API | match | 12,14 | services/bnpl/partners.ts |
| 1624 | K1 | 3/6/12 months configurable | some-match | 12,14 | services/payroll/run-rules.ts |
| 1625 | K1 | equal/installment | match | 12,14 | services/bnpl/installments.ts |
| 1626 | K1 | 0 or interest-bearing | some-match | 12,14 | services/reconciliation/rules.ts |
| 1627 | K1 | auto-reconciliation | some-match | 12,14 | config/features.ts |
| 1628 | K1 | per partner | some-match | 12,14 | app/(public)/[slug]/page.tsx |
| 1629 | K1 | BNPL | some-match | 12,14 | services/jobs/handlers.generated.ts |
| 1630 | K1 | per installment | some-match | 12,14 | services/invoice/installments.ts |
| 1631 | K1 | (Bengali only) | manual | 12,14 | - |
| 1632 | K1 | BNPL full/partial to partner | match | 12,14 | services/bnpl/offers.ts |
| 1633 | L1 | PCI SAQ-A no card data on servers | generic-match | 10,11 | config/processors.ts |
| 1634 | L1 | hosted fields only | some-match | 10,11 | config/s16-api.ts |
| 1635 | L1 | PCI- gateway-provided tokens | match | 10,11 | scripts/verify/step11-braintree.ts |
| 1636 | L1 | PCI admin | some-match | 10,11 | config/processors.ts |
| 1637 | L1 | PCI card-related events | match | 10,11 | config/boot/s04-alerting.ts |
| 1638 | L2 | rule-based | manual | 10,11 | - |
| 1639 | L2 | too many payments per hour | match | 10,11 | sql/assertions/s03_lock_state.sql |
| 1640 | L2 | (Bengali only) | manual | 10,11 | - |
| 1641 | L2 | (Bengali only) | manual | 10,11 | - |
| 1642 | L2 | IP card country vs IP | some-match | 10,11 | scripts/verify/step12-nmi.ts |
| 1643 | L2 | known fraud devices | match | 10,11 | lib/cms/defaults/legal.ts |
| 1644 | L2 | (Bengali only) | manual | 10,11 | - |
| 1645 | L2 | 3DS OTP SCA compliance | generic-match | 10,11 | services/payroll/register.ts |
| 1646 | L2 | 3DS frictionless challenge | some-match | 10,11 | scripts/verify/step11-stripe.ts |
| 1647 | L3 | authorization code | some-match | 10,11 | scripts/verify/step12-nmi.ts |
| 1648 | L3 | every dollar traced | generic-match | 10,11 | app/(dashboard)/payroll/settings/page.tsx |
| 1649 | L3 | daily | some-match | 10,11 | services/payroll/runs.ts |
| 1650 | L3 | (Bengali only) | manual | 10,11 | - |
| 1651 | L3 | future JPY/KRW | generic-match | 10,11 | services/social/schedules.ts |
| 1652 | L3 | cents dollars | match | 10,11 | app/(dashboard)/payroll/settings/page.tsx |
| 1653 | M1 | daily/weekly/monthly | match | 10 | lib/payment/payout.ts |
| 1654 | M1 | (Bengali only) | manual | 10 | - |
| 1655 | M1 | (Bengali only) | manual | 10 | - |
| 1656 | M1 | per gateway | some-match | 10 | app/api/integrations/settlement/payouts/route.ts |
| 1657 | M1 | reasons | some-match | 10 | services/payroll/run-rules.ts |
| 1658 | M1 | per period | some-match | 10 | services/payroll/run-rules.ts |
| 1659 | M1 | per period per merchant | match | 10 | scripts/verify/step14-settlement.ts |
| 1660 | M1 | per period | some-match | 10 | services/payroll/run-rules.ts |
| 1661 | M1 | (Bengali only) | manual | 10 | - |
| 1662 | M1 | (Bengali only) | manual | 10 | - |
| 1663 | M1 | MoR own-gateway | match | 10 | sql/assertions/s16_019_gateway.sql |
| 1664 | M1 | FX | manual | 10 | - |
| 1665 | M1 | per client per period | some-match | 10 | services/payroll/run-rules.ts |
| 1666 | A1 | HMAC-SHA256 bit | match | 13 | lib/email/content.ts |
| 1667 | A1 | per invoice/estimate/receipt | match | 13 | lib/cms/defaults/home.ts |
| 1668 | A1 | server-side on document send | match | 13 | lib/export/xlsx.ts |
| 1669 | A1 | configurable 7/30/90/365 days | some-match | 13 | services/payroll/run-rules.ts |
| 1670 | A1 | Free 30d Pro 90d Enterprise 365d | match | 13 | lib/cms/defaults/pricing.ts |
| 1671 | A1 | manual per link | some-match | 13 | services/payroll/runs.ts |
| 1672 | A1 | generate new link for same document | match | 13 | sql/assertions/s16_020_sub_merchant_kyc.sql |
| 1673 | A1 | per client per date range | some-match | 13 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 1674 | A1 | URL- PII no email no name in URL | match | 13 | services/siem/siem-service.ts |
| 1675 | A1 | random non-sequential | match | 13 | app/(dashboard)/subscriptions/billing/_components/retention-flow.tsx |
| 1676 | A1 | never log full token | match | 13 | services/estimate/public.ts |
| 1677 | A1 | per IP per token 10 req/min | match | 13 | scripts/verify/step10-flow.ts |
| 1678 | A1 | 5 failed lock | match | 13 | services/fraud/reaction.ts |
| 1679 | A1 | noindex nofollow on all token pages | generic-match | 13 | services/cms/cms-service.ts |
| 1680 | A1 | security | some-match | 13 | app/layout.tsx |
| 1681 | A1 | PDF- privacy | match | 13 | lib/i18n/strings/en/s16-ocr.ts |
| 1682 | A2 | OTP client enters OTP to view | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 1683 | A2 | OTP 6-digit 5-min expiry | match | 13 | scripts/verify/step03-core.ts |
