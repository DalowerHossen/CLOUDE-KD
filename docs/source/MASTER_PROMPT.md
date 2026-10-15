================================================================================
PROJECT: KD SOLUTION IT — Enterprise Multi-Tenant SaaS Platform
VERSION: 2.0 (Production-Ready Master Prompt)
LAST UPDATED: [Date]
REPOSITORY: github.com/[your-username]/kd-solution-it
LICENSE: Proprietary
================================================================================

You are an expert full-stack software architect and senior engineer with 15+ 
years of experience building enterprise-grade SaaS platforms. Your task is to 
build "KD SOLUTION IT" — a complete multi-tenant SaaS platform for invoicing, 
payments, payroll, accounting, and business management, targeting the Asian 
market.

You MUST follow every rule in this document without exception. You MUST implement 
every feature listed. You MUST NOT skip any security measure. You MUST NOT use 
placeholders, TODOs, or "Coming Soon" text anywhere.

================================================================================
🔴 ABSOLUTE RULES (ZERO EXCEPTIONS)
================================================================================

RULE 1 — LANGUAGE ENFORCEMENT:
- Interface language: English ONLY throughout the entire codebase
- Zero Bengali, Hindi, Chinese, Arabic, or any non-ASCII script in:
  * UI text, labels, buttons, tooltips
  * Code comments, variable names, function names
  * Database seed data, enum values, default values
  * Email templates, notification text
  * CMS content, blog posts, legal pages
  * Error messages, success messages
  * File names, folder names
- Implement CI lint guard that blocks any PR containing non-ASCII script
- Add pre-commit hook: scripts/check-english-only.sh
- Centralize all user-facing strings in: lib/i18n/strings/en.ts
- Use strict ESLint rule: no-restricted-syntax for non-ASCII patterns

RULE 2 — CURRENCY ENFORCEMENT:
- Base currency: USD ONLY (ISO 4217 code: "USD")
- All financial calculations in USD with numeric(18,4) precision
- Display currencies allowed for client-facing views only (read-only conversion)
- Historical FX rates frozen at invoice creation time
- Never use JavaScript Number for money (use decimal.js or dinero.js)
- Database column type for money: numeric(18,4) NOT NULL
- Validate currency code with Zod: z.enum(['USD']) for base, ISO 4217 for display

RULE 3 — DATA STORAGE POLICY (STRICT):
- Text/structured data → Supabase (PostgreSQL 15+) ONLY
- All files/media → Google Drive API ONLY (via Service Account)
  * Images (JPG, PNG, SVG, WebP, AVIF)
  * PDFs (invoices, receipts, contracts, reports)
  * KYC documents (ID front/back, business docs, address proof)
  * Logos, favicons, branding assets
  * Attachments (invoice attachments, receipt scans)
  * Payroll documents (pay slips, tax forms)
  * E-signature evidence
  * Dispute evidence packs
- Every file in Google Drive MUST be AES-256-GCM encrypted BEFORE upload
- Implement zero-knowledge encryption: encryption key derived from tenant_id + 
  master key, never stored in plaintext
- Per-tenant Google Drive folder structure: /tenants/{tenant_id}/{category}/
- Supabase Storage used ONLY as fallback when Google Drive API is unavailable
- Implement adapter pattern: lib/storage/adapters/ (google-drive.ts, supabase.ts)

RULE 4 — EXCLUDED FEATURES (DO NOT BUILD):
- ❌ QR Business Card module (completely excluded, no code, no DB table)
- ❌ AI Provider pluggable layer (no OpenAI, Claude, Gemini integration)
- ❌ accountant role (removed from role enum)
- ❌ affiliate role (removed from role enum)
- ❌ reseller/white-label partner role (removed from role enum)
- ❌ Automated test files (unit tests, integration tests, E2E tests) — DO NOT 
      create tests/ folder or any .test.ts files

RULE 5 — PAYMENT PARTNER NAMING CONVENTION:
- NEVER use these brand names directly in UI, code, database, or documentation:
  * bKash, Nagad, GCash, PromptPay, PayNow, UPI, Alipay, WeChat Pay
  * DuitNow, MoMo, OVO, GoPay, PayPay, KakaoPay, GrabPay, TrueMoney, Dana, Boost
- INSTEAD use these generic names everywhere:
  * "Global Payout Partners" (for payout methods)
  * "Local Payment Methods via Licensed Partners" (for collection methods)
- Internal database can use method_code (e.g., "mobile_wallet_a_bd", 
  "bank_transfer_us") but display labels MUST be generic
- Documentation and marketing materials MUST use generic names

RULE 6 — TARGET MARKET:
- Primary: Asia-Pacific (Bangladesh, India, Philippines, Thailand, Singapore, 
  Malaysia, Vietnam, Indonesia, Japan, South Korea, China)
- Secondary: USA (for ACH/eCheck freelancer market)
- Infrastructure: Multi-region (Singapore primary, Tokyo secondary)
- CDN: Cloudflare with Asia-Pacific edge priority

================================================================================
🏗️ MANDATORY TECHNICAL STACK
================================================================================

FRONTEND:
- Framework: Next.js 14+ (App Router, Server Components, Server Actions)
- Language: TypeScript 5+ (strict mode, no `any` types)
- Styling: Tailwind CSS 3+ with custom design tokens
- Components: shadcn/ui (Radix UI primitives)
- Icons: Lucide React (single icon set)
- Forms: React Hook Form + Zod validation
- State: Zustand (client state) + TanStack Query (server state)
- Animations: Framer Motion (reduced-motion support)
- Charts: Recharts
- Rich Text: Tiptap (sanitized with DOMPurify)
- PDF Generation: @react-pdf/renderer (server-side)

BACKEND:
- Runtime: Node.js 20+ (LTS)
- API: Next.js Route Handlers (app/api/)
- Database: Supabase (PostgreSQL 15+)
- Auth: Supabase Auth (JWT RS256, OAuth2, 2FA TOTP)
- Realtime: Supabase Realtime (WebSocket)
- Row-Level Security: Supabase RLS (default-deny policies)
- Background Jobs: Supabase pg_cron + DB-backed queue (FOR UPDATE SKIP LOCKED)
- File Storage: Google Drive API v3 (Service Account OAuth2)
- Email: Universal SMTP adapter (default: Resend)
- Captcha: Cloudflare Turnstile
- Rate Limiting: Supabase table-based (Upstash Redis adapter ready)
- Caching: Netlify CDN + ISR + stale-while-revalidate

PAYMENT GATEWAYS (all with pluggable adapter pattern):
- Stripe (Connect for MoR)
- PayPal (Orders API v2)
- Paddle (Checkout + Subscriptions)
- NMI (Three-Step Redirect + Direct Post)
- Rapyd (Collect + Payout API)
- Adyen (Checkout + MarketPay)
- Custom gateway adapter (JSON-driven config)

INTEGRATIONS:
- WhatsApp: Meta Cloud API (WhatsApp Business Platform)
- Social Media: Facebook Graph API, Instagram Graph API, LinkedIn Marketing API, 
  X API v2, Threads API, Telegram Bot API, Pinterest API v5
- E-commerce: Shopify Admin API, WooCommerce REST API
- Bank Feed: Plaid, Salt Edge (adapter pattern)
- OCR: Google Cloud Vision API (receipt scanning)
- Analytics: GA4, GTM, Meta Pixel + CAPI, TikTok, LinkedIn, X, Clarity, Pinterest

DEPLOYMENT:
- Primary: Netlify (production)
- Alternatives: Docker + VPS, Vercel (parity tested)
- CDN: Cloudflare (DDoS, WAF, SSL)
- Monitoring: Sentry (with PII scrubbing)
- Uptime: UptimeRobot / Better Stack
- SIEM: Pluggable (Splunk, Elastic, Datadog, Chronicle ready)

SECURITY TOOLS:
- SAST: Semgrep
- DAST: OWASP ZAP
- SCA: Snyk + Dependabot
- Secret Scanning: gitleaks, truffleHog
- Container Scanning: Trivy
- IaC Scanning: Checkov
- Malware Scanning: ClamAV (file uploads)

================================================================================
👥 ROLE MODEL (6 ROLES WITH APPROVAL HIERARCHY)
================================================================================

1. super_admin → KD SOLUTION IT founder/owner (you)
   - Highest authority, approves everything
   - Can impersonate any user
   - Full platform access
   - 2FA mandatory, step-up for critical actions

2. ceo → Platform CEO (under super_admin)
   - Operational leader
   - All actions require super_admin approval
   - Can approve admin_staff requests up to defined limits
   - 2FA mandatory

3. admin_staff → Specialized workers (under super_admin/CEO)
   Sub-roles:
   - kyc_reviewer (KYC review only)
   - payment_processor (payment/payout handling only)
   - support_agent (ticket handling only)
   - content_manager (CMS/blog only)
   - compliance_officer (audit/compliance only)
   - fraud_analyst (fraud review only)
   - finance_analyst (reports/revenue only)
   All actions require CEO or super_admin approval
   2FA mandatory

4. owner → Customer (business owner, freelancer)
   - Full access to own company data
   - Manages own staff
   - Manages own payroll
   - Manages own branding, gateway, KYC
   - 2FA mandatory

5. staff → Owner's employee
   - Granular permissions set by owner
   - Request-send approval workflow (staff drafts, owner approves/sends)
   - 2FA mandatory (owner-enforced)

6. [NO CLIENT ROLE] → Clients access via tokenized HMAC links (login-free)

APPROVAL WORKFLOW ENGINE:
- Every action has an approval_level (L1: staff, L2: CEO, L3: super_admin)
- Approval SLA with auto-escalation
- Approval delegation (CEO on leave → super_admin auto)
- Dual approval for critical actions (CEO + super_admin both)
- Approval history with complete chain
- Approval dashboard per role
- Bulk approval for CEO/super_admin

Implementation files:
- lib/auth/roles.ts (role definitions)
- lib/auth/permissions.ts (permission matrix)
- lib/auth/approval-engine.ts (approval workflow)
- lib/auth/approval-rules.ts (approval level mapping)

================================================================================
🗄️ DATABASE SCHEMA RULES
================================================================================

GENERAL RULES:
- Every table MUST have: id (UUID v7), company_id (UUID, nullable only for 
  platform-level), created_at (TIMESTAMPTZ UTC), updated_at (TIMESTAMPTZ UTC), 
  deleted_at (TIMESTAMPTZ UTC, nullable)
- Every money column: numeric(18,4) NOT NULL
- Every timestamp: TIMESTAMPTZ (UTC, no local time)
- Every UUID: UUID v7 (time-sortable, better index locality)
- Every foreign key: ON DELETE RESTRICT (never CASCADE for audit)
- Every table: RLS enabled with default-deny policy
- Every table: partial unique index for soft-deleted rows
- Every table: index on company_id for tenant queries
- Every table: index on created_at for pagination
- Every table: audit trigger (insert into audit_logs on INSERT/UPDATE/DELETE)

NAMING CONVENTIONS:
- Table names: snake_case, plural (e.g., invoices, payment_methods)
- Column names: snake_case (e.g., invoice_number, due_date)
- Enum types: snake_case with suffix _enum (e.g., invoice_status_enum)
- Index names: idx_{table}_{columns} (e.g., idx_invoices_company_id_status)
- Foreign key names: fk_{table}_{referenced_table} 
- Check constraint names: chk_{table}_{column}_{rule}

CONCURRENCY & INTEGRITY:
- Invoice numbering: PostgreSQL advisory lock (pg_advisory_xact_lock)
- Stock updates: SELECT FOR UPDATE
- Wallet balance: Serializable isolation level
- Optimistic locking: version column (INTEGER DEFAULT 0)
- Idempotency: idempotency_key column on payments, webhooks
- Deduplication: content_hash column on files, duplicate_check_hash on invoices

Migration file structure:
- migrations/{timestamp}_{description}.sql
- Every migration MUST have corresponding rollback: {timestamp}_{description}_down.sql
- Migrations MUST be idempotent (IF NOT EXISTS, IF EXISTS)
- Zero-downtime migration pattern: expand-contract

================================================================================
📁 PROJECT STRUCTURE (MANDATORY)
================================================================================

kd-solution-it/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                      # Lint, build, security scan
│   │   ├── deploy.yml                  # Production deployment
│   │   └── security.yml                # SAST, DAST, SCA
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── .husky/
│   ├── pre-commit                      # Lint, format, type-check
│   └── commit-msg                      # Conventional commits
├── app/
│   ├── (public)/                       # Public pages (no auth)
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Homepage
│   │   ├── about/
│   │   ├── pricing/
│   │   ├── contact/
│   │   ├── blog/
│   │   ├── terms/
│   │   ├── privacy/
│   │   ├── features/
│   │   ├── industries/
│   │   ├── calculators/
│   │   ├── free-invoice-generator/
│   │   └── ... (all 45 public pages)
│   ├── (auth)/                         # Auth pages
│   │   ├── login/
│   │   ├── signup/
│   │   ├── forgot-password/
│   │   ├── reset-password/
│   │   ├── verify-email/
│   │   └── 2fa/
│   ├── (dashboard)/                    # Owner/Staff dashboard
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Dashboard home
│   │   ├── invoices/
│   │   ├── estimates/
│   │   ├── clients/
│   │   ├── payments/
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── suppliers/
│   │   ├── expenses/
│   │   ├── accounting/
│   │   ├── projects/
│   │   ├── payroll/
│   │   ├── reports/
│   │   ├── subscriptions/
│   │   ├── wallet/
│   │   ├── settings/
│   │   ├── notifications/
│   │   └── support/
│   ├── (admin)/                        # Super admin / CEO / admin_staff
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Admin dashboard
│   │   ├── users/
│   │   ├── tenants/
│   │   ├── plans/
│   │   ├── coupons/
│   │   ├── kyc/
│   │   ├── gateways/
│   │   ├── payouts/
│   │   ├── disputes/
│   │   ├── revenue/
│   │   ├── audit/
│   │   ├── cms/
│   │   ├── blog/
│   │   ├── emails/
│   │   ├── support/
│   │   ├── branding/
│   │   ├── settings/
│   │   ├── feature-flags/
│   │   ├── health/
│   │   ├── approvals/                  # Approval queue
│   │   ├── fraud/
│   │   └── compliance/
│   ├── (client-portal)/                # Tokenized client access
│   │   ├── i/[token]/                  # Invoice view
│   │   ├── e/[token]/                  # Estimate approve
│   │   ├── r/[token]/                  # Receipt
│   │   ├── hub/[token]/                # Client hub (all invoices)
│   │   ├── c/[token]/                  # Contract sign
│   │   └── expired/
│   ├── api/
│   │   ├── auth/
│   │   ├── invoices/
│   │   ├── estimates/
│   │   ├── clients/
│   │   ├── payments/
│   │   ├── subscriptions/
│   │   ├── reports/
│   │   ├── inventory/
│   │   ├── suppliers/
│   │   ├── expenses/
│   │   ├── accounting/
│   │   ├── projects/
│   │   ├── payroll/
│   │   ├── wallet/
│   │   ├── kyc/
│   │   ├── team/
│   │   ├── settings/
│   │   ├── webhooks/                   # Incoming webhooks
│   │   │   ├── stripe/
│   │   │   ├── paypal/
│   │   │   ├── paddle/
│   │   │   ├── nmi/
│   │   │   ├── rapyd/
│   │   │   ├── adyen/
│   │   │   ├── shopify/
│   │   │   ├── woocommerce/
│   │   │   └── whatsapp/
│   │   ├── email/
│   │   ├── whatsapp/
│   │   ├── storage/
│   │   ├── pdf/
│   │   ├── admin/
│   │   ├── public/v1/                  # Public REST API
│   │   ├── health/
│   │   ├── cron/
│   │   ├── search/
│   │   ├── notifications/
│   │   ├── export/
│   │   ├── import/
│   │   └── approvals/                  # Approval API
│   ├── not-found.tsx
│   ├── error.tsx
│   └── loading.tsx
├── components/
│   ├── ui/                             # shadcn/ui components
│   ├── layout/                         # Layout components
│   ├── forms/                          # Form components
│   ├── tables/                         # Table components
│   ├── charts/                         # Chart components
│   ├── invoice/                        # Invoice components
│   ├── payment/                        # Payment components
│   ├── client/                         # Client components
│   ├── admin/                          # Admin components
│   ├── email/                          # Email templates
│   ├── pdf/                            # PDF components
│   ├── onboarding/                     # Onboarding wizard
│   ├── settings/                       # Settings components
│   ├── shared/                         # Shared components
│   └── marketing/                      # Marketing components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser client
│   │   ├── server.ts                   # Server client
│   │   ├── admin.ts                    # Service role client
│   │   ├── middleware.ts               # Auth middleware
│   │   └── rls-helpers.ts
│   ├── auth/
│   │   ├── roles.ts
│   │   ├── permissions.ts
│   │   ├── approval-engine.ts
│   │   ├── approval-rules.ts
│   │   ├── two-factor.ts
│   │   ├── oauth.ts
│   │   └── session.ts
│   ├── payment/
│   │   ├── adapters/
│   │   │   ├── base.ts                 # Abstract gateway interface
│   │   │   ├── stripe.ts
│   │   │   ├── paypal.ts
│   │   │   ├── paddle.ts
│   │   │   ├── nmi.ts
│   │   │   ├── rapyd.ts
│   │   │   ├── adyen.ts
│   │   │   └── custom.ts
│   │   ├── mor-engine.ts               # Merchant of Record logic
│   │   ├── routing.ts                  # Gateway routing
│   │   ├── wallet.ts                   # Virtual wallet
│   │   ├── payout.ts                   # Payout engine
│   │   └── fee-calculator.ts
│   ├── storage/
│   │   ├── adapters/
│   │   │   ├── base.ts
│   │   │   ├── google-drive.ts         # PRIMARY
│   │   │   └── supabase.ts             # FALLBACK
│   │   ├── encryption.ts               # AES-256-GCM
│   │   ├── upload.ts
│   │   └── file-validator.ts
│   ├── email/
│   │   ├── adapters/
│   │   │   ├── base.ts
│   │   │   ├── resend.ts
│   │   │   ├── sendgrid.ts
│   │   │   ├── ses.ts
│   │   │   ├── mailgun.ts
│   │   │   ├── postmark.ts
│   │   │   └── smtp.ts                 # Generic SMTP
│   │   ├── templates/
│   │   ├── queue.ts
│   │   └── deliverability.ts
│   ├── whatsapp/
│   │   ├── meta-cloud-api.ts
│   │   ├── templates.ts
│   │   ├── campaigns.ts
│   │   └── webhook.ts
│   ├── social/
│   │   ├── adapters/
│   │   │   ├── facebook.ts
│   │   │   ├── instagram.ts
│   │   │   ├── linkedin.ts
│   │   │   ├── x.ts
│   │   │   ├── threads.ts
│   │   │   ├── telegram.ts
│   │   │   └── pinterest.ts
│   │   ├── scheduler.ts
│   │   └── analytics.ts
│   ├── pdf/
│   │   ├── invoice-pdf.tsx
│   │   ├── estimate-pdf.tsx
│   │   ├── receipt-pdf.tsx
│   │   ├── payslip-pdf.tsx
│   │   ├── report-pdf.tsx
│   │   ├── evidence-pack-pdf.tsx
│   │   └── pdf-engine.ts
│   ├── encryption/
│   │   ├── aes-256-gcm.ts
│   │   ├── key-vault.ts
│   │   ├── key-rotation.ts
│   │   └── pii-redaction.ts
│   ├── validation/
│   │   ├── schemas/                    # Zod schemas per entity
│   │   ├── sanitize.ts                 # Input sanitization
│   │   └── validators.ts
│   ├── utils/
│   │   ├── currency.ts                 # USD-only utilities
│   │   ├── date.ts                     # UTC utilities
│   │   ├── formatting.ts
│   │   ├── slug.ts
│   │   └── hash.ts
│   ├── hooks/                          # React hooks
│   ├── providers/                      # React context providers
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   ├── tenant.ts
│   │   ├── vpn-detector.ts
│   │   ├── bot-detector.ts
│   │   └── csrf.ts
│   ├── security/
│   │   ├── csp.ts                      # Content Security Policy
│   │   ├── headers.ts                  # Security headers
│   │   ├── sanitizer.ts                # Input sanitization
│   │   ├── captcha.ts                  # Cloudflare Turnstile
│   │   ├── device-fingerprint.ts
│   │   ├── ip-reputation.ts
│   │   ├── vpn-proxy-detector.ts
│   │   ├── fraud-engine.ts
│   │   ├── risk-scoring.ts
│   │   ├── anomaly-detection.ts
│   │   ├── audit-log.ts
│   │   ├── hash-chain.ts               # Immutable audit chain
│   │   ├── siem-forwarder.ts
│   │   └── zero-trust.ts
│   ├── compliance/
│   │   ├── gdpr.ts
│   │   ├── ccpa.ts
│   │   ├── pdpa.ts
│   │   ├── pci-dss.ts
│   │   ├── data-classification.ts
│   │   ├── data-retention.ts
│   │   ├── consent-manager.ts
│   │   └── dsar-handler.ts             # Data Subject Access Request
│   ├── integrations/
│   │   ├── shopify.ts
│   │   ├── woocommerce.ts
│   │   ├── zapier.ts
│   │   ├── make.ts
│   │   ├── plaid.ts
│   │   └── salt-edge.ts
│   ├── ocr/
│   │   └── receipt-ocr.ts
│   ├── fx/
│   │   ├── exchange-rates.ts
│   │   └── provider.ts
│   ├── analytics/
│   │   ├── ga4.ts
│   │   ├── gtm.ts
│   │   ├── meta-pixel.ts
│   │   ├── tiktok.ts
│   │   ├── linkedin.ts
│   │   ├── x.ts
│   │   ├── clarity.ts
│   │   └── pinterest.ts
│   ├── seo/
│   │   ├── json-ld.ts                  # 8 schema types
│   │   ├── og-image.ts
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   └── i18n/
│       └── strings/
│           └── en.ts                   # All English strings
├── services/                           # Business logic layer
│   ├── invoice/
│   ├── estimate/
│   ├── payment/
│   ├── subscription/
│   ├── wallet/
│   ├── client/
│   ├── product/
│   ├── inventory/
│   ├── accounting/
│   ├── payroll/
│   ├── report/
│   ├── kyc/
│   ├── mor/
│   ├── email/
│   ├── whatsapp/
│   ├── social/
│   ├── webhook/
│   ├── storage/
│   ├── pdf/
│   ├── fx/
│   ├── tax/
│   ├── entitlement/
│   ├── audit/
│   ├── notification/
│   ├── import/
│   ├── export/
│   ├── approval/
│   ├── fraud/
│   └── compliance/
├── types/                              # TypeScript type definitions
│   ├── database.ts                     # Supabase generated types
│   ├── invoice.ts
│   ├── payment.ts
│   ├── client.ts
│   ├── user.ts
│   ├── gateway.ts
│   └── ... (per entity)
├── schemas/                            # Zod validation schemas
├── stores/                             # Zustand stores
├── emails/                             # React Email templates
├── pdf-templates/                      # PDF layout templates
├── migrations/                         # Supabase SQL migrations
│   ├── {timestamp}_{description}.sql
│   └── {timestamp}_{description}_down.sql
├── seeds/                              # Idempotent seed scripts
├── scripts/
│   ├── backup.sh                       # pg_dump
│   ├── restore.sh                      # pg_restore
│   ├── check-english-only.sh           # Non-ASCII blocker
│   ├── check-no-tests.sh               # Ensure no test files
│   ├── check-no-todo.sh                # Ensure no TODO/FIXME
│   ├── check-no-coming-soon.sh         # Ensure no "Coming Soon"
│   └── deploy.sh
├── public/                             # Static assets
├── styles/                             # Global CSS
├── config/
│   ├── nav-map.ts                      # Single source of truth
│   ├── plans.ts                        # Plan definitions
│   ├── permissions.ts                  # Permission matrix
│   ├── feature-flags.ts
│   ├── payment-methods.ts
│   └── countries.ts
├── workers/                            # Background job processors
├── cron/                               # Cron job handlers
├── docs/                               # Documentation
│   ├── ERD.md
│   ├── ADR/                            # Architecture Decision Records
│   ├── RUNBOOKS/                       # Per-feature runbooks
│   └── API.md
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx.conf
├── .env.example                        # ENV template (all variables)
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .dockerignore
├── netlify.toml
├── next.config.js
├── package.json
├── tsconfig.json                       # strict: true, no implicit any
├── tailwind.config.ts
├── components.json                     # shadcn config
├── middleware.ts                       # Next.js middleware
├── instrumentation.ts                  # Sentry
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── LICENSE
└── MASTER_PROMPT.md                    # This file

================================================================================
📦 COMPLETE FEATURE IMPLEMENTATION (3,950 FEATURES)
================================================================================

Implement all 3,950 features from these 11 parts (full list in 
FEATURE_LIST.md in repository root):

PART 1 — Core Foundation & Branding (375 features)
PART 2 — Auth, Onboarding & Settings (391 features)
PART 3 — Invoicing & Business Core (476 features)
PART 4 — Payment, Gateway & MoR System (423 features)
PART 5 — Client Experience & Branding (275 features)
PART 6 — WhatsApp, Social, API & Integrations (413 features)
PART 7 — Super Admin, SEO, Analytics & Marketing (445 features)
PART 8 — Payroll, HR, Accounting & Reports (356 features)
PART 9 — Security, Compliance & Performance (296 features)
PART 10 — Deploy, CI/CD & Final Polish (150 features)
PART 11 — Enhanced Security, Roles & Zero Trust (425 features)

NEVER skip a feature. NEVER leave a feature partially implemented. 
NEVER use "TODO" or "Coming Soon".

================================================================================
🔐 SECURITY REQUIREMENTS (ZERO TOLERANCE)
================================================================================

LAYER 1 — NETWORK SECURITY:
- Cloudflare WAF enabled on all domains
- DDoS protection (Layer 3/4/7)
- TLS 1.3 minimum (reject TLS 1.0/1.1/1.2)
- HSTS with preload (max-age=31536000; includeSubDomains; preload)
- DNSSEC enabled
- VPN/Proxy/Tor detection and blocking:
  * Use IPQualityScore or MaxMind GeoIP2 Anonymous IP database
  * Block VPN IPs on: signup, payment page, KYC upload, admin panel
  * Flag VPN IPs on: login (require 2FA)
  * Admin whitelist for corporate VPNs
  * Implementation: lib/security/vpn-proxy-detector.ts
- Datacenter IP detection (AWS/GCP/Azure ranges)
- Residential proxy detection
- IP reputation scoring (threat intelligence feed)
- Geo-fencing (country-level block configurable)
- IP rate limiting (per IP, per endpoint)
- Country-level IP block (admin configurable)

LAYER 2 — APPLICATION SECURITY:
- SQL Injection: Parameterized queries ONLY (no string concatenation)
- XSS Prevention:
  * Output encoding (automatic in React)
  * Input sanitization (DOMPurify for rich text)
  * Strip <script>, <iframe>, <object>, <embed>, <applet>
  * Strip JavaScript event handlers (on*, javascript:)
  * Strip data:, vbscript: URI schemes
  * Strip CSS expression(), url(), @import injection
  * Strip SVG <script>, MathML <script>
  * Trusted Types API enforcement
  * Implementation: lib/security/sanitizer.ts
- CSRF Protection: Double-submit cookie pattern on all POST/PUT/DELETE
- SSRF Guard: URL allowlist, block internal IPs (127.0.0.1, 10.x, 192.168.x)
- Clickjacking: X-Frame-Options: DENY + frame-ancestors 'none'
- CSP (Content-Security-Policy):
  * nonce-based, no 'unsafe-inline'
  * default-src 'self'
  * script-src 'self' 'nonce-{random}'
  * style-src 'self' 'nonce-{random}'
  * img-src 'self' https: data:
  * connect-src 'self' https://api.supabase.co
  * frame-ancestors 'none'
  * form-action 'self'
  * base-uri 'self'
  * object-src 'none'
  * upgrade-insecure-requests
  * block-all-mixed-content
- CORS: Strict allowlist (only known origins)
- Open Redirect: Validate all redirect URLs against allowlist
- Mass Assignment: Zod strict mode (strip unknown fields)
- Prototype Pollution: Deep freeze on object literals
- ReDoS: Use safe-regex library to validate all regex patterns
- Command Injection: Never use shell commands with user input
- Path Traversal: Validate all file paths, reject "../"
- LDAP Injection: N/A (no LDAP used)
- XML External Entity (XXE): Disable XML entity resolution
- HTTP Header Injection: Strip \r\n from all header values
- Null Byte Injection: Reject \x00 in all inputs
- Unicode Normalization: NFC on all string inputs
- Zero-width character removal
- RTL override character removal
- All inputs implementation: lib/security/sanitizer.ts

LAYER 3 — AUTHENTICATION & ACCESS CONTROL:
- Supabase JWT (RS256 signed)
- 2FA (TOTP) mandatory for all account-holding roles
- 2FA setup: QR code + backup codes (10 codes, one-time use)
- 2FA recovery: Backup code → reset 2FA
- OAuth 2.0: Google, GitHub (encrypted token storage)
- WebAuthn/FIDO2 ready (future hardware key support)
- Session Fixation Prevention: Rotate session ID on login
- Brute-force Lockout: 5 failed attempts → 15 min lock (exponential backoff)
- Password Breach Check: HIBP API integration (SHA-1 k-anonymity)
- Password Policy: Min 12 chars, uppercase, lowercase, number, special
- Password History: Last 5 passwords blocked
- Role-Based Access Control: 6 roles (super_admin/ceo/admin_staff/owner/staff + client-tokenized)
- Row-Level Security: Supabase RLS with default-deny on every table
- Step-up 2FA: Required for sensitive actions (gateway change, payout, KYC)
- Session Cookie: HttpOnly + Secure + SameSite=Strict
- Session Timeout: Configurable (default 24h, enterprise custom)
- Device/Session Revoke: Owner can revoke any staff session
- Login notifications (new device, unusual IP)

LAYER 4 — DATA ENCRYPTION:
- AES-256-GCM for all sensitive data
- Key derivation: PBKDF2 (100,000 iterations) or Argon2id
- Key management: Separate encryption keys per environment (dev/staging/prod)
- ENCRYPTION_KEY (master key) NEVER rotated (data loss risk)
- Secondary keys ROTATED every 90 days
- Encrypted fields tagged with key-version
- service_role key ONLY on server (never in client bundle)
- Client bundle secret-leak scanner (CI check)
- ENV schema validation at boot (fail-fast on missing)
- Per-environment keys in separate .env files
- Secret access audit log
- Backup encryption (encrypted at rest + in transit)
- Google Drive client-side encryption BEFORE upload (zero-knowledge)
- Encryption performance benchmark (document in docs/)
- PII log redaction (Sentry integration)
- Blind index for encrypted field search

LAYER 5 — MULTI-TENANT ISOLATION:
- company_id column on EVERY table (except global tables)
- Supabase RLS with default-deny policy on EVERY table
- Example RLS policy:
  CREATE POLICY "tenant_isolation" ON invoices
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
- Every query validates company_id in middleware (lib/middleware/tenant.ts)
- Cross-tenant ID guard: Return 404 (never 403) to prevent enumeration
- Google Drive folder isolation: /tenants/{tenant_id}/
- Storage path isolation (per tenant)
- Shared tables (plans, countries) have RLS allowing read-only
- Automated isolation tests (via SQL assertions, no test files)
- IDOR guard on every endpoint (ownership check)
- RLS performance optimization (SELECT auth.jwt() wrapped in SECURITY DEFINER)
- Fuzz testing endpoints (SQL script to verify isolation)
- Admin impersonation: Clearly marked, time-limited, audit-logged

LAYER 6 — FRAUD & ABUSE PREVENTION:
- Rate limiting on ALL API endpoints
- Brute-force lockout (exponential backoff)
- Suspicious login alerts (unusual IP/time/device)
- Cloudflare Turnstile CAPTCHA on signup/login/forgot-password
- Honeypot fields in forms
- Device fingerprinting (browser + mobile)
- Device fingerprint reuse detection
- IP geo-location anomaly (impossible travel)
- Velocity checks (login/signup/payment per hour)
- Disposable email blocklist
- Trial abuse detection (same device/IP multiple trials)
- Same IP multiple accounts flag
- Same bank account multiple tenants flag
- Bot traffic filtering
- User-agent validation
- Headless browser detection (navigator.webdriver, phantom.js)
- Unusual traffic pattern alerts
- Suspicious activity auto-suspend
- Phone verification (optional)
- Large payload DOS guard (max 10MB request)
- Zip-bomb protection (decompression ratio check)
- Fraud scoring engine (rule-based, real-time)
- AML/sanctions screening (automated)
- Periodic re-screening (weekly cron)
- Transaction monitoring (anomaly detection)
- Coupon one-time policy enforcement
- Referral fraud guard
- Account takeover detection (ATO signals)
- Session hijacking detection (mid-session IP/device change)
- Credential stuffing detection (known breach passwords)
- Insider threat detection (admin_staff unusual activity)
- Implementation: lib/security/fraud-engine.ts

LAYER 7 — FILE UPLOAD SECURITY:
- Magic byte verification (every file type)
- File extension + MIME type cross-check
- File header signature validation
- SVG sanitization (XML entity, script tag removal)
- SVG re-encoding (rasterize to PNG for untrusted sources)
- Image metadata strip (EXIF, GPS, camera info)
- Image re-encoding (prevent steganography)
- PDF JavaScript removal
- PDF embedded file extraction block
- Office macro removal (DOCX, XLSX)
- ZIP/Archive bomb detection
- ZIP slip vulnerability prevention
- Polyglot file detection
- File size limit (per type: image 5MB, PDF 10MB, KYC 5MB)
- File upload rate limit (per user, per minute)
- File upload quota (per tenant, per month)
- Malware scan hook (ClamAV)
- File hash duplicate check
- File name sanitization (path traversal, special chars)
- File upload timeout (30 seconds)
- File upload chunking (large files, resume support)
- File upload integrity check (client hash vs server hash)
- File download signed URL (short-lived, 1 hour)
- File download rate limit
- File access audit log
- File watermarking (export files, tenant ID embedded)
- File retention policy (auto-delete after N years)
- File quarantine (suspicious files isolated)
- Implementation: lib/storage/file-validator.ts

LAYER 8 — TOKEN & LINK SECURITY:
- HMAC-SHA256 signed tokens (128-bit random)
- Per-document unique links
- Token expiry configurable (plan-based: 7/30/90/365 days)
- Token revoke (manual, per link)
- Token re-issue (new link for same document)
- Optional email-OTP gate (6-digit, 5-min expiry)
- Token URL contains NO PII
- Token enumeration prevention (128-bit random)
- Token masked in logs/analytics
- No token passed to gateway redirects
- No tracking pixels in PDFs
- Email forward-leak warning
- Token rate-limit + brute-force guard
- noindex on all token pages
- Expired-link re-request page
- Token leak detection alerts
- Implementation: lib/auth/tokens.ts

LAYER 9 — ZERO TRUST ARCHITECTURE:
- Never trust, always verify (every request authenticated)
- Least privilege access (minimum required permissions)
- Micro-segmentation (tenant isolation at every layer)
- Continuous verification (session re-validation every request)
- Device trust scoring (every device evaluated)
- Network trust scoring (every IP evaluated)
- User trust scoring (behavioral, real-time)
- Transaction trust scoring (every payment evaluated)
- Adaptive MFA (risk-based step-up authentication)
- Just-in-time access (temporary elevated permissions)
- Just-enough access (minimum scope, minimum duration)
- Assume breach mentality (all data encrypted, all logs immutable)

LAYER 10 — ZERO TOLERANCE POLICIES:
- Zero tolerance: SQL injection attempt → IP ban + account lock
- Zero tolerance: XSS attempt → IP ban + account lock
- Zero tolerance: CSRF attempt → session terminate + alert
- Zero tolerance: Brute force → permanent IP ban
- Zero tolerance: Credential stuffing → account lock + 2FA enforce
- Zero tolerance: Data exfiltration → account suspend + investigation
- Zero tolerance: Fraud detection → account freeze + fund hold
- Zero tolerance: Chargeback fraud → merchant suspend + evidence
- Zero tolerance: Insider threat → access revoke + audit
- Zero tolerance: Compliance violation → auto-remediation + alert
- Zero tolerance: Vulnerability exploitation → WAF block + patch
- Zero tolerance: DDoS attempt → Cloudflare challenge + block
- Zero tolerance: Bot activity → CAPTCHA + block
- Implementation: lib/security/zero-trust.ts

================================================================================
🔐 IMMUTABLE AUDIT LOG & SIEM
================================================================================

AUDIT LOG REQUIREMENTS:
- Every action logged (login, logout, create, update, delete, view sensitive)
- Append-only (no update, no delete allowed on audit_logs table)
- Hash-chain: each entry contains hash of previous entry (tamper-proof)
- Cryptographic signing: Ed25519 per entry
- Timestamp authority: NTP-synced, UTC
- Sequence number: Gap detection
- Write-once storage: Google Drive immutable bucket (versioning enabled)
- Periodic Merkle tree root (tamper-proof root hash)
- Retention: 7 years minimum (configurable per jurisdiction)
- Search & filter (by user, action, resource, time)
- Export (CSV/JSON/SIEM format)
- Integrity check (periodic hash verification cron)
- Alert on tamper detection

Audit log fields:
- id (UUID v7)
- timestamp (TIMESTAMPTZ UTC)
- sequence_number (BIGINT, auto-increment, gap-detected)
- user_id (UUID, nullable for system actions)
- tenant_id (UUID, nullable for platform actions)
- action (TEXT, e.g., "invoice.created", "payment.processed")
- resource_type (TEXT, e.g., "invoice", "payment")
- resource_id (UUID)
- ip_address (INET)
- user_agent (TEXT)
- device_fingerprint (TEXT)
- location (JSONB, country/city/isp)
- metadata (JSONB, action-specific data)
- previous_hash (TEXT, SHA-256 of previous entry)
- current_hash (TEXT, SHA-256 of current entry)
- signature (TEXT, Ed25519 signature)
- correlation_id (UUID, request tracing)

SIEM INTEGRATION:
- SIEM log forwarding (Syslog, CEF, LEEF format)
- Pluggable SIEM adapters:
  * Splunk (HEC API)
  * Elastic SIEM (Elasticsearch)
  * Datadog (Logs API)
  * AWS CloudWatch
  * Azure Sentinel
  * Google Chronicle (UDM format)
- SIEM correlation rules
- SIEM dashboard
- SIEM alert escalation
- Real-time event streaming (Kafka/Redis Streams ready)
- Event normalization (common schema)
- Threat intelligence feed integration (IOC matching)
- Implementation: lib/security/siem-forwarder.ts

================================================================================
🚨 MONITORING, ALERTING & INCIDENT RESPONSE
================================================================================

MONITORING:
- Application Performance Monitoring (Sentry)
- Real User Monitoring (page load, interactions)
- Synthetic monitoring (uptime checks every 60s)
- API endpoint monitoring (response time, error rate)
- Database query monitoring (slow queries >1s)
- Payment gateway monitoring (success rate, latency)
- Email delivery monitoring (bounce rate, spam rate)
- WhatsApp API monitoring (delivery rate, block rate)
- Storage monitoring (Google Drive quota, API limits)
- Cron job monitoring (dead man's switch)
- SSL certificate monitoring (expiry alerts)
- Domain expiry monitoring
- DNS monitoring (propagation, hijacking)
- CDN cache hit ratio monitoring
- Error budget tracking (SLO/SLI)

ALERTING:
- Alert rule engine (threshold, anomaly, pattern)
- Alert channels: Email, Slack, Discord, Webhook, PagerDuty, SMS
- Alert severity: Critical, High, Medium, Low, Info
- Alert routing (severity → channel → on-call person)
- Alert deduplication (same alert within 5 min)
- Alert escalation (unacknowledged → next level)
- Alert silence (maintenance window)
- Alert history
- Alert dashboard
- On-call roster management (weekly rotation)
- On-call handoff (shift change summary)

INCIDENT RESPONSE:
- Incident creation (manual + auto from alert)
- Incident severity (SEV1-SEV4)
- Incident commander assignment (CEO/super_admin)
- Incident war room (Slack/Discord auto-create channel)
- Incident timeline (chronological events)
- Incident status (investigating/identified/monitoring/resolved)
- Incident communication (internal + customer-facing)
- Status page auto-update
- Incident post-mortem template
- Incident runbook (per incident type)
- Incident metrics (MTTD, MTTR, MTBF)
- Incident review meeting (post-resolution)
- Incident trend report (monthly)
- Disaster recovery plan (DRP)
- DR drill (quarterly, documented)
- RTO (Recovery Time Objective): <4 hours
- RPO (Recovery Point Objective): <1 hour
- Implementation: docs/RUNBOOKS/

================================================================================
💳 CHARGEBACK & REFUND EVIDENCE SYSTEM
================================================================================

One-click Evidence Pack generation (per dispute):
Evidence Pack contents:
1. Invoice PDF (immutable snapshot, from Google Drive)
2. Payment receipt (timestamped)
3. Consent proof:
   - Checkbox acceptance timestamp (UTC)
   - IP address at consent
   - Device fingerprint
   - Terms version accepted
   - Refund policy version accepted
   - Exact consent text (immutable snapshot)
   - Visual screenshot render
4. Delivery proof:
   - Delivery confirmation field
   - Work completion acknowledgment
   - Client e-signature (if applicable)
   - Estimate approval record (pre-work)
   - Delivery proof upload (owner)
   - Tracking number (physical goods)
   - Service completion date
   - Client acceptance link confirmation
5. Communication log:
   - All emails (sent/delivered/opened/clicked)
   - All WhatsApp messages
   - All SMS
   - Email thread with headers
6. Client identity:
   - IP + device fingerprint
   - Geo-location at purchase
   - 3DS authentication proof
7. Timeline (chronological):
   - Invoice created
   - Invoice sent
   - Invoice viewed (with timestamps + IP)
   - Payment page visited
   - Payment attempted
   - Payment succeeded
   - Receipt sent
   - Delivery confirmed
   - Dispute raised
8. Audit chain:
   - Hash-chain proof
   - Invoice PDF hash
   - Timestamp authority proof
9. Platform details:
   - Clear statement descriptor
   - Owner contact information
   - "Contact seller first" message proof

Evidence Pack features:
- Gateway-ready format (Stripe/PayPal/Adyen/NMI specific)
- Auto-submit to processor via API
- Download (PDF, ZIP)
- Email to processor (auto)
- Per-dispute case file (organized)
- 24-hour submission framework
- 18-month retention (Google Drive encrypted)
- Dispute deadline tracker (countdown)
- Dispute status workflow (new → evidence submitted → won/lost)
- Dispute win/loss analytics (per gateway, per reason code)
- Dispute reason code mapping (per processor)
- Chargeback reserve calculator (per merchant)
- Chargeback rate monitoring (<0.65% threshold alert)
- Refund policy auto-display on checkout
- Refund request workflow (client → owner → approve → process)
- Refund evidence preservation (post-refund audit trail)
- Implementation: services/dispute/evidence-pack.ts

================================================================================
🕵️ USER TRACKING & ANTI-FRAUD
================================================================================

DEVICE TRACKING:
- Device fingerprint (browser, OS, screen, fonts, plugins)
- Device ID (persistent, cross-session)
- Device type detection (mobile/tablet/desktop/bot)
- Browser fingerprint (Canvas, WebGL, AudioContext)
- Browser plugin detection
- Screen resolution + color depth
- Timezone + language detection
- Hardware concurrency (CPU cores)
- Touch support detection
- Device battery status (fraud signal)
- Device charging status
- Device change alert (known user, new device)
- Device trust score
- Device blacklist (known fraud devices)
- Implementation: lib/security/device-fingerprint.ts

IP & NETWORK TRACKING:
- IP address logging (every action)
- IP geolocation (country, city, ISP)
- IP type detection (residential/datacenter/mobile/proxy/VPN)
- ISP name logging
- ASN logging
- IP reputation score
- IP change detection (mid-session)
- IP velocity (multiple logins per hour)
- IP-device binding
- IP-account mapping
- Network latency tracking (bot signal)
- DNS leak detection (WebRTC)
- Implementation: lib/security/ip-reputation.ts

ACTIVITY TRACKING:
- All page views (URL, timestamp, duration)
- All click events (button, link, form)
- All form submissions (fields changed)
- All API calls (endpoint, method, status, duration)
- All file uploads/downloads
- All payment actions (initiate, complete, fail)
- All setting changes (who changed what)
- All exports (data exfiltration detection)
- All logins/logouts
- All 2FA actions
- All approval/reject actions
- All data deletions
- All impersonation actions
- Session duration tracking
- Mouse movement pattern (bot detection)
- Keyboard typing pattern (bot detection)
- Scroll pattern (bot detection)
- Activity heatmap (per user, per session)

================================================================================
📝 CODE QUALITY STANDARDS
================================================================================

TYPESCRIPT:
- strict: true in tsconfig.json
- noImplicitAny: true
- strictNullChecks: true
- noUnusedLocals: true
- noUnusedParameters: true
- Zero `any` types without justification comment
- All functions have explicit return types
- All props interfaces exported
- Discriminated unions over enums where possible

CODE ORGANIZATION:
- Every file starts with path comment: // path: lib/payment/stripe.ts
- One commit per feature (atomic commits)
- Conventional commits: feat/fix/docs/style/refactor/perf/test/chore
- Pre-commit hooks: lint, format, type-check, non-ASCII check
- No console.log in production code (use structured logger)
- No TODO/FIXME comments (implement or remove)
- No "Coming Soon" text anywhere
- Max file size: 500 lines (split if larger)
- Max function size: 50 lines (refactor if larger)

NAMING CONVENTIONS:
- Files: kebab-case (invoice-card.tsx, payment-service.ts)
- React components: PascalCase (InvoiceCard, PaymentForm)
- Functions: camelCase (createInvoice, processPayment)
- Constants: SCREAMING_SNAKE_CASE (MAX_INVOICE_LINES, DEFAULT_CURRENCY)
- Types/Interfaces: PascalCase (Invoice, PaymentMethod)
- Database tables: snake_case plural (invoices, payment_methods)
- Database columns: snake_case (invoice_number, created_at)

ERROR HANDLING:
- Every async function in try-catch
- Custom error classes (ValidationError, NotFoundError, UnauthorizedError)
- Structured error responses: { error: { code, message, details, correlation_id } }
- Error logging with Sentry (PII scrubbed)
- Correlation ID in every request/response
- User-friendly error messages (English only)
- Never expose internal errors to users
- Error boundary on every React tree

================================================================================
📊 PERFORMANCE REQUIREMENTS
================================================================================

- Lighthouse score ≥90 on all pages
- LCP (Largest Contentful Paint) <2.5s
- INP (Interaction to Next Paint) <200ms
- CLS (Cumulative Layout Shift) <0.1
- TTFB (Time to First Byte) <600ms
- Bundle size budget: <200KB (initial JS)
- Image optimization: AVIF/WebP with srcset
- Font subsetting + preload
- Critical CSS inline
- Third-party scripts: defer/async
- Service Worker caching (PWA)
- CDN cache headers (immutable for versioned assets)
- HTTP/3 support
- Brotli compression
- Resource hints (preconnect, prefetch)
- Edge computing (Netlify Edge Functions)
- N+1 query prevention
- Index coverage audit (monthly)
- Cursor pagination for large lists (>100 items)
- Server-side filter/sort (never client-side for large data)
- Cache layer with invalidation map
- Heavy component dynamic import
- Code splitting (route + component)
- Database query timeout: 30 seconds
- API response timeout: 30 seconds
- Background job timeout: 10 minutes

================================================================================
🎨 UI/UX STANDARDS
================================================================================

DESIGN SYSTEM:
- Mobile-first CSS (min-width queries)
- Breakpoints: 320/375/430/768/1024/1280/1920
- Touch targets ≥44x44px
- Font size ≥16px (prevent iOS zoom)
- Centralized spacing scale: 4/8/12/16/24/32/48/64
- Centralized radius scale: none/sm/md/lg/xl/full
- Centralized shadow scale: sm/md/lg/xl/2xl
- Icon set: Lucide React (single source)
- Color contrast: ≥4.5:1 (normal text), ≥3:1 (large text)
- Dark mode: Full parity (every component)
- High-contrast mode support
- Reduced-motion support (prefers-reduced-motion)
- Focus ring on all interactive elements
- Skip links for accessibility
- aria-labels on all icon buttons
- aria-live for form errors
- WCAG 2.1 AA compliance

PAGE COMPLETENESS (ZERO BLANK PAGES):
- Loading state (skeleton)
- Error state (with retry)
- Empty state (with CTA)
- Success state
- NO "Coming Soon" text
- NO placeholder content (lorem ipsum)
- Real copy on every page
- Every button/label/tooltip written
- Every error/success message written

NAVIGATION INTEGRITY:
- Single centralized nav-map: config/nav-map.ts
- Every route registered in nav-map
- Auto-generated breadcrumbs from nav-map
- Role-based menu filtering
- Zero dead-link audit (CI check)
- Build-time link verification
- Command palette (⌘K)
- Keyboard shortcuts reference page (? key)

MOBILE OPTIMIZATION:
- Hamburger + slide drawer navigation
- Bottom navigation bar (5 main items)
- iOS safe-area inset support
- Tables → card list on mobile (auto)
- Full-screen Sheet dialogs on mobile
- Sticky bottom action bar (forms)
- Correct input keyboard type (numeric/email/tel)
- Multi-step forms on mobile (stepper)
- Swipe actions on list items
- Pull-to-refresh
- Mobile-optimized charts
- Mobile PDF preview (native viewer)
- Mobile payment page (Apple/Google Pay priority)
- Offline detection banner
- Every page tested at 320px (CI check)

================================================================================
🔄 CONFLICT & DUPLICATE PREVENTION (IMPLEMENTATION)
================================================================================

Implement these as CODE in services/, NOT as prompts:

DATA CONFLICT PREVENTION:
1. Optimistic Locking:
   - Add version column (INTEGER DEFAULT 0 NOT NULL) to every editable table
   - On UPDATE: WHERE id = ? AND version = ? (increment version)
   - If 0 rows updated → throw ConflictError
   - UI shows: "Another user edited this. Reload to see changes."
   - Implementation: services/base/optimistic-lock.ts

2. Pessimistic Locking:
   - Use SELECT FOR UPDATE for critical operations (stock, wallet)
   - Use SELECT FOR UPDATE SKIP LOCKED for job queues
   - Implementation: services/base/pessimistic-lock.ts

3. Advisory Locking:
   - PostgreSQL pg_advisory_xact_lock for invoice numbering
   - Lock key: hash(tenant_id + 'invoice_number')
   - Auto-release at transaction end
   - Implementation: services/invoice/numbering.ts

4. Real-time Co-editing:
   - Supabase Realtime for presence detection
   - Show "John is editing this invoice" indicator
   - Edit lock timeout: 5 minutes (auto-release)
   - Implementation: lib/providers/presence-provider.tsx

5. Concurrent Payment Guard:
   - Idempotency-Key header required on payment endpoints
   - Store in payments_idempotency table (24-hour TTL)
   - Return cached response if duplicate
   - Implementation: lib/middleware/idempotency.ts

DUPLICATE PREVENTION:
1. Invoice Duplicate Detection:
   - Hash: SHA-256(tenant_id + client_id + total_amount + invoice_date)
   - Check before create: SELECT 1 FROM invoices WHERE duplicate_hash = ?
   - If exists → show warning: "Similar invoice exists. Create anyway?"
   - Implementation: services/invoice/duplicate-detector.ts

2. Payment Duplicate Detection:
   - Unique constraint: UNIQUE(gateway, gateway_transaction_id)
   - Webhook idempotency: UNIQUE(gateway, webhook_event_id)
   - Implementation: services/payment/duplicate-detector.ts

3. Client Duplicate Detection:
   - Fuzzy match: levenshtein(name, name) <= 3 AND email = email
   - Suggest merge if match found
   - Implementation: services/client/duplicate-detector.ts

4. Product Duplicate Detection:
   - Unique constraint: UNIQUE(tenant_id, sku) WHERE deleted_at IS NULL
   - Fuzzy name check: suggest if similar
   - Implementation: services/product/duplicate-detector.ts

5. Expense Duplicate Detection:
   - Hash: SHA-256(receipt_file_hash + amount + date)
   - Check on create
   - Implementation: services/expense/duplicate-detector.ts

6. Journal Entry Duplicate Detection:
   - Hash: SHA-256(sorted(accounts) + amount + date)
   - Check on post
   - Implementation: services/accounting/duplicate-detector.ts

7. Payroll Duplicate Detection:
   - Unique constraint: UNIQUE(tenant_id, employee_id, pay_period)
   - Implementation: services/payroll/duplicate-detector.ts

8. Webhook Duplicate Detection:
   - Store in webhook_events table with event_id
   - Return 200 OK if duplicate (idempotent)
   - Implementation: lib/webhook/duplicate-detector.ts

9. Email Duplicate Detection:
   - Hash: SHA-256(recipient + subject + body + timestamp_minute)
   - Prevent sending within 1 minute
   - Implementation: services/email/duplicate-detector.ts

10. API Request Duplicate Detection:
    - Idempotency-Key header
    - Store in api_idempotency table (24-hour TTL)
    - Return cached response
    - Implementation: lib/middleware/api-idempotency.ts

11. Form Submission Duplicate Detection:
    - CSRF token (one-time use)
    - Submit button disabled on submit
    - Implementation: components/shared/form-wrapper.tsx

12. File Upload Duplicate Detection:
    - Content hash: SHA-256(file_bytes)
    - Check in files table before upload
    - Return existing file ID if duplicate
    - Implementation: lib/storage/duplicate-detector.ts

13. Import Duplicate Detection:
    - Pre-flight check during CSV import
    - Show duplicates in preview
    - User chooses: skip/overwrite/create new
    - Implementation: services/import/duplicate-detector.ts

14. Batch Operation Duplicate Guard:
    - Unique batch_id per operation
    - Check batch_operations table
    - Implementation: services/batch/duplicate-detector.ts

15. Cron Job Overlap Prevention:
    - Leader lock: pg_advisory_lock(hash(job_name))
    - Only one instance runs at a time
    - Implementation: cron/base/leader-lock.ts

ALL IMPLEMENTATIONS MUST:
- Have error handling (throw ConflictError or DuplicateError)
- Have audit log entry
- Have user-friendly error message
- Have UI for conflict resolution
- Have unit of code in services/ (NOT in middleware or routes)

================================================================================
🚫 FORBIDDEN PRACTICES
================================================================================

NEVER:
- Use `any` type without JSDoc justification
- Use `console.log` in production code
- Leave TODO/FIXME comments
- Use "Coming Soon" placeholder text
- Hardcode secrets in code
- Store secrets in client bundle
- Use client-side-only validation (always server-side too)
- Use GET for state-changing operations
- Use session cookies without HttpOnly + Secure + SameSite
- Expose internal error details to users
- Store passwords in plaintext (use Supabase Auth)
- Store card numbers (use hosted fields only)
- Use eval() or Function() constructor
- Use innerHTML without DOMPurify
- Use dangerouslySetInnerHTML without sanitization
- Use regex without ReDoS check
- Make synchronous file I/O in request handlers
- Make N+1 database queries
- Fetch all records without pagination
- Use SELECT * (always specify columns)
- Use string concatenation for SQL (use parameterized queries)
- Trust user input (always validate + sanitize)
- Skip RLS policies (every table must have default-deny)
- Create test files (unit, integration, E2E) — tests excluded from this project
- Commit .env files
- Commit node_modules
- Commit build artifacts
- Use git force push on main/develop
- Deploy without code review
- Deploy on Friday after 3pm

ALWAYS:
- Validate inputs with Zod (strict mode)
- Sanitize outputs
- Use parameterized SQL queries
- Use environment variables for config
- Use TypeScript strict mode
- Use conventional commits
- Write path comments at file top
- Handle errors in try-catch
- Log with structured JSON (Sentry)
- Add correlation ID to every request
- Add audit log entry for every mutation
- Enforce RLS on every table
- Encrypt sensitive data (AES-256-GCM)
- Use HTTPS everywhere (HSTS)
- Use CSP (nonce-based)
- Rate-limit every endpoint
- Idempotency key on payments
- Optimistic locking on edits
- Advisory lock on numbering
- Audit log on every action
- Review every PR before merge

================================================================================
🎯 IMPLEMENTATION PRIORITY (ORDER)
================================================================================

Build in this order (10 chats total, as planned):

CHAT 1: Foundation
- Database schema (migrations)
- Auth system (Supabase + 2FA + OAuth)
- Role model (6 roles) + approval engine
- Universal SMTP system
- Onboarding wizard
- Basic settings
- Public site skeleton (homepage, auth pages)

CHAT 2: Invoicing Core
- Invoice CRUD
- Line items (dynamic)
- American-style Amazon-acceptable invoice
- PDF engine (React-PDF)
- Invoice numbering (gapless, advisory lock)
- Invoice statuses & workflow

CHAT 3: CRM & Business
- Client CRM (CRUD, search, merge)
- Product/Service catalog
- Inventory & warehouse
- Suppliers & purchase orders
- Dashboard & basic reports

CHAT 4: Payments & MoR
- Pluggable gateway adapters (Stripe/PayPal/Paddle/NMI/Rapyd/Adyen/Custom)
- Payment processing & experience
- Payment links & hosted checkout
- Pluggable integration (iFrame/SDK/API)
- Virtual wallet + MoR system
- KYC-gated routing
- Payout processing
- Chargeback & dispute management
- Evidence Pack generator

CHAT 5: Client Experience
- Tokenized client access (HMAC)
- Client-facing pages (invoice/payment/estimate/receipt/hub/contract)
- Client email journey (all templates)
- Tenant branding (per-tenant customization)
- White-label tier
- Document integrity & workflow

CHAT 6: Automation & Integrations
- WhatsApp automation (Meta Cloud API)
- Social media automation (7 platforms)
- Public REST API + Webhooks
- Zapier/Make/Chrome extension
- Bank feed & reconciliation
- Receipt OCR
- Contracts & e-signature
- Multi-channel messaging

CHAT 7: Admin & Marketing
- Super admin dashboard
- CEO + admin_staff roles
- Approval engine (full)
- CMS editor
- Blog management
- Email template manager
- SEO (8 JSON-LD schemas, OG, sitemap)
- Analytics & pixels
- Conversion optimization
- Marketing automation

CHAT 8: Payroll, Accounting & Reports
- Payroll system (complete)
- HR management
- Double-entry accounting
- Chart of Accounts
- Journal entries (manual + automated)
- Financial statements (P&L, Balance Sheet, Cash Flow)
- Bank reconciliation
- Fixed assets & depreciation
- Budget management
- Tax filing & compliance
- Financial reports (15+)

CHAT 9: Security & Compliance (Deep)
- All security layers (10 layers)
- VPN/Proxy detection
- Device fingerprinting
- Fraud engine
- Zero Trust architecture
- Zero Tolerance policies
- Immutable audit log + SIEM
- Compliance (GDPR/CCPA/PDPA/all)
- Data residency
- Conflict & duplicate prevention (ALL implementations)
- Monitoring, alerting, incident response

CHAT 10: Deploy & Final Polish
- Netlify deploy config
- Docker self-hosting
- CI/CD pipeline (GitHub Actions)
- Cron jobs (20 total)
- Monitoring setup (Sentry, UptimeRobot)
- Documentation (README, CONTRIBUTING, SECURITY, ERD, ADR)
- Final UX polish
- PWA setup
- Performance optimization
- Final security audit

================================================================================
📄 WHEN STARTING EACH CHAT:
================================================================================

At the start of EACH chat, reference this document:
"I am building KD SOLUTION IT per MASTER_PROMPT.md. 
Current chat: [N] of 10. Scope: [description]. 
Continuing from where previous chat ended."

At the end of EACH chat, create a handoff document:
"CHAT_[N]_COMPLETED.md containing:
- Features implemented
- Files created/modified
- Database migrations added
- Dependencies installed
- Known issues
- Next chat's starting point"

================================================================================
🎯 FINAL INSTRUCTION
================================================================================

Build this platform systematically. For EVERY feature:
1. Read the feature from FEATURE_LIST.md
2. Implement with full type safety (TypeScript strict)
3. Add input validation (Zod)
4. Add input sanitization (lib/security/sanitizer.ts)
5. Add RLS policy (if DB table)
6. Add audit log entry
7. Add error handling (try-catch + custom errors)
8. Add correlation ID
9. Add rate limiting (if API)
10. Add idempotency (if mutation)
11. Add optimistic locking (if editable)
12. Add duplicate detection (if applicable)
13. Add UI with all 4 states (loading/error/empty/success)
14. Add mobile responsive (test at 320px)
15. Add accessibility (ARIA, keyboard nav, focus)
16. Add dark mode support
17. Document (path comment, JSDoc for complex logic)

NEVER skip steps. NEVER use "TODO". NEVER use "Coming Soon".
The platform must be production-ready, enterprise-grade, 
Amazon-acceptable quality from day one.

Begin implementation.

================================================================================
END OF MASTER PROMPT v2.0
================================================================================
