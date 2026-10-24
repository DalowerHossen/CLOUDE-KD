-- path: migrations/S02_008_realtime.sql
-- STEP 02.10 Realtime authorization for presence channels. Topics are "tenant:<company id>:<resource>" or
-- "platform:<resource>". On a plain PostgreSQL database without the realtime schema this migration does nothing.

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found; skipping presence policies';
    return;
  end if;

  execute 'drop policy if exists kd_presence_select on realtime.messages';
  execute $p$create policy kd_presence_select on realtime.messages for select to authenticated
    using (
      (select realtime.topic()) like 'tenant:' || coalesce((select public.app_company_id())::text, 'none') || ':%'
      or ((select public.app_is_platform()) and (select realtime.topic()) like 'platform:%')
    )$p$;

  execute 'drop policy if exists kd_presence_insert on realtime.messages';
  execute $p$create policy kd_presence_insert on realtime.messages for insert to authenticated
    with check (
      (select realtime.topic()) like 'tenant:' || coalesce((select public.app_company_id())::text, 'none') || ':%'
      or ((select public.app_is_platform()) and (select realtime.topic()) like 'platform:%')
    )$p$;
end
$$;
