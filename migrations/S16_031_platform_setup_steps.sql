-- path: migrations/S16_031_platform_setup_steps.sql
-- STEP 16 First-run setup of the platform: the eight steps of the wizard (branding, e-mail, payment processors, plans, domains,
-- payout partners, WhatsApp, analytics) are recorded in the same table as the earlier steps. Old rows stay valid.

alter table public.platform_setup drop constraint if exists platform_setup_step_key_check;
alter table public.platform_setup add constraint platform_setup_step_key_check
  check (step_key in ('approval_mode', 'email', 'security', 'branding', 'gateways', 'plans', 'domains', 'payouts', 'whatsapp', 'analytics'));
