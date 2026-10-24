-- path: migrations/S16_017_membership_hardening.sql
-- Audit finding S7: an owner could add any existing user (also a user of another company) to the own company through the
-- table API, with a status and permissions of the owner's choice, because the policies check the company of the row but not
-- who the user is. The application writes memberships through the service role only (invitation and team services), so the
-- table privileges to write are removed from signed-in users. Reading stays as it was.

revoke insert, update, delete on public.memberships from authenticated;
