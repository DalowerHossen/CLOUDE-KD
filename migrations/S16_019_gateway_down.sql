-- path: migrations/S16_019_gateway_down.sql
drop table if exists public.gateway_key_windows;
drop table if exists public.gateway_calls;
drop table if exists public.sub_merchant_keys;
drop table if exists public.sub_merchants;
drop table if exists public.gateway_routes;
drop table if exists public.gateway_upstreams;
drop function if exists public.kd_gateway_hit(uuid, uuid, timestamptz);
drop function if exists public.kd_gateway_calls_append();
drop function if exists public.kd_gateway_guard();
