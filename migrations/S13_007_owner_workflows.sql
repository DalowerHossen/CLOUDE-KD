-- path: migrations/S13_007_owner_workflows.sql
-- STEP 13.7 Owner workflows: the reason when the owner denies a re-requested link, and the staff "request to send" of a
-- contract (the approval request, who asked, the note, and the reason when the owner said no).

alter table public.link_requests add column if not exists denied_reason text not null default '' check (char_length(denied_reason) <= 500);

alter table public.contracts add column if not exists send_request_id uuid;
alter table public.contracts add column if not exists send_requested_by uuid;
alter table public.contracts add column if not exists send_request_version integer;
alter table public.contracts add column if not exists send_message text not null default '' check (char_length(send_message) <= 1000);
alter table public.contracts add column if not exists send_rejected_reason text not null default '' check (char_length(send_rejected_reason) <= 500);

create index if not exists ix_contracts_send_request on public.contracts (send_request_id) where send_request_id is not null and deleted_at is null;

-- Two more kinds in the contract log: a staff member asked to send, and the owner said no.
alter table public.contract_events drop constraint if exists contract_events_kind_check;
alter table public.contract_events add constraint contract_events_kind_check
  check (kind in ('created', 'edited', 'sent', 'invited', 'viewed', 'reminded', 'signed', 'declined', 'voided', 'expired', 'renewal_notice', 'send_requested', 'send_rejected'));
