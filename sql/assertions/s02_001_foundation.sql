-- path: sql/assertions/s02_001_foundation.sql
-- Helpers from S02_001: uuid v7, standard triggers, soft delete, live unique index.
do $$
declare
  a uuid; b uuid; v int; n int;
begin
  a := public.uuid_generate_v7();
  b := public.uuid_generate_v7();
  assert substr(a::text, 15, 1) = '7', 'uuid version nibble must be 7';
  assert substr(a::text, 20, 1) in ('8','9','a','b'), 'uuid variant must be RFC 4122';
  assert a <> b, 'uuids must differ';

  create temp table t_found (
    id uuid primary key default public.uuid_generate_v7(),
    slug text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
  );
  perform public.apply_standard_triggers('t_found'::regclass);
  perform public.create_live_unique_index('t_found'::regclass, 'slug');

  insert into t_found (slug) values ('a') returning id into a;
  update t_found set slug = 'a2' where id = a;
  select version into v from t_found where id = a;
  assert v = 2, 'version must be bumped on update';

  begin
    update t_found set version = 9 where id = a;
    assert false, 'skipping a version must fail';
  exception when sqlstate '40001' then null;
  end;

  delete from t_found where id = a;
  select count(*) into n from t_found where id = a and deleted_at is not null;
  assert n = 1, 'delete must soft delete';

  insert into t_found (slug) values ('a2');
  begin
    insert into t_found (slug) values ('a2');
    assert false, 'live unique index must reject duplicate';
  exception when unique_violation then null;
  end;
end
$$;
