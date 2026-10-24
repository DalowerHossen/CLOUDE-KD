-- path: migrations/S13_007_owner_workflows_down.sql
alter table public.contract_events drop constraint if exists contract_events_kind_check;
alter table public.contract_events add constraint contract_events_kind_check
  check (kind in ('created', 'edited', 'sent', 'invited', 'viewed', 'reminded', 'signed', 'declined', 'voided', 'expired', 'renewal_notice'));
drop index if exists public.ix_contracts_send_request;
alter table public.contracts drop column if exists send_rejected_reason;
alter table public.contracts drop column if exists send_message;
alter table public.contracts drop column if exists send_request_version;
alter table public.contracts drop column if exists send_requested_by;
alter table public.contracts drop column if exists send_request_id;
alter table public.link_requests drop column if exists denied_reason;
