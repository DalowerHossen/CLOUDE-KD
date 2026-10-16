-- path: sql/assertions/s06_006_analytics.sql
-- Counters: one row per day, page and event; adding counts up; bad paths and events refused; closed to clients.
do $$
begin
  perform public.kd_analytics_hit('/pricing', 'page_view');
  perform public.kd_analytics_hit('/pricing', 'page_view');
  perform public.kd_analytics_hit('/pricing', 'signup_click');
  assert (select hit_count from public.analytics_daily where path = '/pricing' and event = 'page_view') = 2, 'hits add up';
  assert (select count(*) from public.analytics_daily where path = '/pricing') = 2, 'one row per event';
  begin perform public.kd_analytics_hit('/Bad Path', 'page_view'); assert false, 'path checked';
  exception when check_violation then null; end;
  begin perform public.kd_analytics_hit('/pricing', 'purchase'); assert false, 'event checked';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.analytics_daily', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_analytics_hit(text, text)', 'execute'), 'service role only';
end
$$;
