-- path: migrations/S16_017_membership_hardening_down.sql
grant insert, update on public.memberships to authenticated;
