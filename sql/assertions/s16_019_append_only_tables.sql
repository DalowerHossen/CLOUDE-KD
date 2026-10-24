-- path: sql/assertions/s16_019_append_only_tables.sql
-- Rule 9 asks for deleted_at on every table. The tables without it are logs and ledgers that must never change: each of them has
-- a row trigger that runs before every update or delete (append-only or immutable). A new table without deleted_at and without
-- such a trigger fails here.
do $$
declare names text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into names
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'deleted_at')
    and not exists (
      select 1 from pg_trigger t
      where t.tgrelid = c.oid and not t.tgisinternal
        and (t.tgtype & 1) = 1      -- row level
        and (t.tgtype & 2) = 2      -- before
        and ((t.tgtype & 16) = 16 or (t.tgtype & 8) = 8)  -- update or delete
        and (t.tgname like '%append%' or t.tgname like '%immutable%' or t.tgname like '%guard%' or t.tgname like '%access%')
    );
  assert names is null, 'tables without deleted_at must be append-only: ' || coalesce(names, '');
end $$;
