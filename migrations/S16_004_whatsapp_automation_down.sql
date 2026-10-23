-- path: migrations/S16_004_whatsapp_automation_down.sql
drop function if exists public.kd_whatsapp_template_recipients_24h(uuid);
drop table if exists public.whatsapp_campaign_items;
drop table if exists public.whatsapp_campaigns;
drop table if exists public.whatsapp_rule_runs;
drop table if exists public.whatsapp_rules;
alter table public.whatsapp_accounts drop column if exists daily_limit;
drop function if exists public.kd_whatsapp_automation_guard();
drop function if exists public.kd_whatsapp_campaign_guard();
drop function if exists public.kd_whatsapp_item_guard();
