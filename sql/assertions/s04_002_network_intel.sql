-- path: sql/assertions/s04_002_network_intel.sql
-- Whitelist ranges, cached reputation with expiry, Tor list replacement, closed to clients.
do $$
declare h1 text := repeat('1', 64); h2 text := repeat('2', 64); h3 text := repeat('3', 64); r jsonb;
begin
  insert into public.ip_reputation (kind, cidr, note) values ('whitelist', '203.0.113.0/24', 'office');
  assert public.kd_network_whitelisted('203.0.113.77'), 'address inside the range';
  assert not public.kd_network_whitelisted('203.0.114.1'), 'address outside the range';
  assert not public.kd_network_whitelisted('not-an-ip'), 'garbage is not whitelisted';
  begin insert into public.ip_reputation (kind, note) values ('whitelist', 'x'); assert false, 'whitelist needs a range';
  exception when check_violation then null; end;
  begin insert into public.ip_reputation (kind, cidr) values ('reputation', '10.0.0.0/8'); assert false, 'reputation needs a hash';
  exception when check_violation then null; end;

  assert public.kd_reputation_get(h1) = 'null'::jsonb, 'unknown address';
  perform public.kd_reputation_put(h1, 80, '{"vpn":true}', 'US', 'test', 3600);
  r := public.kd_reputation_get(h1);
  assert (r ->> 'score')::int = 80 and r -> 'flags' ->> 'vpn' = 'true' and r ->> 'countryCode' = 'US', 'cached reputation';
  perform public.kd_reputation_put(h1, 10, '{}', 'US', 'test', 3600);
  assert (public.kd_reputation_get(h1) ->> 'score')::int = 10, 'cache entry is updated, not duplicated';
  update public.ip_reputation set expires_at = now() - interval '1 second' where ip_hash = h1;
  assert public.kd_reputation_get(h1) = 'null'::jsonb, 'expired entries are ignored';
  assert public.kd_reputation_purge() >= 1, 'purge removes expired entries';

  perform public.kd_tor_replace(array[h2, h3], 3600);
  assert public.kd_reputation_get(h2) ->> 'kind' = 'tor_exit', 'tor exit known';
  perform public.kd_tor_replace(array[h3], 3600);
  assert public.kd_reputation_get(h2) = 'null'::jsonb, 'exit that left the list is removed';
  assert public.kd_reputation_get(h3) ->> 'kind' = 'tor_exit', 'exit that stayed is kept';

  perform public.kd_whitelist_add('198.51.100.5/24', 'branch', null);
  assert public.kd_network_whitelisted('198.51.100.200'), 'host bits are normalised to the network';
  begin perform public.kd_whitelist_add('0.0.0.0/0', 'everything', null); assert false, 'whole internet';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_whitelist_add('10.0.0.0/7', 'wide', null); assert false, 'too wide';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_whitelist_add('banana', 'x', null); assert false, 'garbage';
  exception when sqlstate '22023' then null; end;

  set local role authenticated;
  begin perform 1 from public.ip_reputation; assert false, 'authenticated reads';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_network_whitelisted('1.1.1.1'); assert false, 'authenticated calls function';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
