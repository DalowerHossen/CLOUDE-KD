-- path: migrations/S04_006_alerting_incidents_down.sql
drop function if exists public.kd_incident_metrics(integer);
drop function if exists public.kd_incident_transition(uuid, text, uuid, text);
drop function if exists public.kd_alert_escalate(integer);
drop function if exists public.kd_alert_resolve(uuid);
drop function if exists public.kd_alert_ack(uuid, uuid);
drop function if exists public.kd_alert_raise(text, text, text, text, text, uuid, integer, integer);
drop table if exists public.incident_events;
drop table if exists public.incidents;
drop table if exists public.oncall_roster;
drop table if exists public.alert_channels;
drop table if exists public.alert_silences;
drop table if exists public.alerts;
