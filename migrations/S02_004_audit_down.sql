-- path: migrations/S02_004_audit_down.sql
do $$
declare t text;
begin
  foreach t in array array['companies', 'profiles', 'memberships', 'role_permissions', 'feature_flags']
  loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
  end loop;
end
$$;
drop function if exists public.audit_enable_for(regclass);
drop function if exists public.audit_row_change();
drop function if exists public.kd_audit_verify(text, bigint, bigint);
drop function if exists public.kd_audit_append(uuid, uuid, text, uuid, text, text, uuid, text, text, text, text, jsonb);
drop table if exists public.audit_checkpoints;
drop table if exists public.audit_logs;
drop function if exists public.audit_block_change();
drop function if exists public.audit_chain_before_insert();
drop function if exists public.audit_entry_hash(public.audit_logs);
drop function if exists public.audit_entry_material(public.audit_logs);
