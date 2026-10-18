-- path: sql/assertions/s13_001_portal_core.sql
-- Portal foundation: RLS on, events append only, one pending re-request per token, decision columns agree with the status,
-- the token lookup works for an expired token and is closed to ordinary roles.
do $$
declare
  c uuid; cl uuid; inv uuid; tok uuid; r uuid; n integer; h text := repeat('a', 64);
  found record;
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname in ('portal_events', 'link_requests') and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Portal Co', 'portal-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, '{"name":"Buyer","postalCode":"10001","country":"US"}') returning id into inv;
  insert into public.access_tokens (company_id, doc_type, doc_id, token_hash, expires_at, ttl_days)
    values (c, 'invoice', inv, h, now() - interval '1 day', 7) returning id into tok;

  -- the lookup returns an expired token's identity
  select * into found from public.kd_portal_token_lookup(h);
  assert found.id = tok and found.company_id = c and found.doc_type = 'invoice' and found.doc_id = inv, 'lookup identity';
  assert found.expires_at < now(), 'lookup shows expiry';
  assert not exists (select 1 from public.kd_portal_token_lookup(repeat('b', 64))), 'unknown hash finds nothing';
  assert not has_function_privilege('anon', 'public.kd_portal_token_lookup(text)', 'execute'), 'anon cannot call lookup';
  assert not has_function_privilege('authenticated', 'public.kd_portal_token_lookup(text)', 'execute'), 'authenticated cannot call lookup';

  -- events are a log
  insert into public.portal_events (company_id, token_id, doc_type, doc_id, event, ip_hash, user_agent, device)
    values (c, tok, 'invoice', inv, 'view', h, 'Mozilla/5.0', 'Chrome on Windows');
  begin update public.portal_events set event = 'print'; assert false, 'events edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.portal_events; assert false, 'events deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.portal_events (company_id, token_id, doc_type, doc_id, event) values (c, tok, 'invoice', inv, 'card_number'); assert false, 'unknown event';
  exception when check_violation then null; end;

  -- one pending re-request per token; the decision columns follow the status
  insert into public.link_requests (company_id, token_id, doc_type, doc_id) values (c, tok, 'invoice', inv) returning id into r;
  begin insert into public.link_requests (company_id, token_id, doc_type, doc_id) values (c, tok, 'invoice', inv); assert false, 'two pending';
  exception when unique_violation then null; end;
  begin update public.link_requests set status = 'approved' where id = r; assert false, 'decided without a time';
  exception when check_violation then null; end;
  update public.link_requests set status = 'denied', decided_at = now() where id = r;
  insert into public.link_requests (company_id, token_id, doc_type, doc_id) values (c, tok, 'invoice', inv);
end
$$;
