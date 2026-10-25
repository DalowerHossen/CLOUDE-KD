-- path: sql/assertions/s16_025_embed_origins.sql
-- Embed origins: RLS on, https (or local http) origins only, no path, one live row per company and origin.
do $$
declare n integer; c uuid;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname = 'checkout_embed_origins' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Embed Co', 'embed-co') returning id into c;
  insert into public.checkout_embed_origins (company_id, origin) values (c, 'https://shop.example.com');
  insert into public.checkout_embed_origins (company_id, origin) values (c, 'http://localhost:3000');
  begin insert into public.checkout_embed_origins (company_id, origin) values (c, 'https://shop.example.com'); assert false, 'unique';
  exception when unique_violation then null; end;
  begin insert into public.checkout_embed_origins (company_id, origin) values (c, 'http://shop.example.com'); assert false, 'https only';
  exception when check_violation then null; end;
  begin insert into public.checkout_embed_origins (company_id, origin) values (c, 'https://shop.example.com/path'); assert false, 'no path';
  exception when check_violation then null; end;
  begin insert into public.checkout_embed_origins (company_id, origin) values (c, 'https://*.example.com'); assert false, 'no wildcard';
  exception when check_violation then null; end;
end $$;
