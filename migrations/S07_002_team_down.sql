-- path: migrations/S07_002_team_down.sql
drop function if exists public.kd_invitation_accept(text, uuid, text);
drop function if exists public.kd_invitation_peek(text);
drop table if exists public.team_invitations;
