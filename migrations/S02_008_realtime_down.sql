-- path: migrations/S02_008_realtime_down.sql
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists kd_presence_select on realtime.messages';
    execute 'drop policy if exists kd_presence_insert on realtime.messages';
  end if;
end
$$;
