-- path: sql/assertions/s05_007_email_templates.sql
-- Template versions: one active revision per company and template, archive on save, reset, restore, isolation.
do $$
declare
  c uuid := public.uuid_generate_v7(); r int;
begin
  insert into public.companies (id, name, slug) values (c, 'T1', 'tpl-a');
  assert public.kd_template_save(null, 'invoice.sent', 'Subject 1', '<p>One</p>', null, null) = 1, 'first revision';
  assert public.kd_template_save(null, 'invoice.sent', 'Subject 2', '<p>Two</p>', 'edit', null) = 2, 'second revision';
  assert (select count(*) from public.email_template_overrides where company_id is null and template_id = 'invoice.sent' and status = 'active') = 1, 'one active revision';
  assert (select subject from public.email_template_overrides where company_id is null and template_id = 'invoice.sent' and status = 'active') = 'Subject 2', 'newest is active';
  assert public.kd_template_save(c, 'invoice.sent', 'Company subject', '<p>Mine</p>', null, null) = 1, 'a company has its own numbering';
  assert (select count(*) from public.email_template_overrides where template_id = 'invoice.sent' and status = 'active') = 2, 'platform and company each have one';
  assert public.kd_template_reset(null, 'invoice.sent'), 'reset';
  assert not exists (select 1 from public.email_template_overrides where company_id is null and status = 'active'), 'no active revision after reset';
  assert (select count(*) from public.email_template_overrides where company_id is null) = 2, 'history is kept';
  assert not public.kd_template_reset(null, 'invoice.sent'), 'nothing to reset twice';
  r := public.kd_template_restore(null, 'invoice.sent', 1, null);
  assert r = 3, 'restore creates a new revision';
  assert (select body_html from public.email_template_overrides where company_id is null and template_id = 'invoice.sent' and status = 'active') = '<p>One</p>', 'restored content is active';
  begin perform public.kd_template_restore(null, 'invoice.sent', 99, null); assert false, 'unknown revision';
  exception when no_data_found then null; end;
  begin insert into public.email_template_overrides (template_id, revision, subject, body_html) values ('Bad Id', 1, 's', 'b'); assert false, 'template id checked';
  exception when check_violation then null; end;
  begin insert into public.email_template_overrides (template_id, revision, subject, body_html) values ('invoice.sent', 3, 's', 'b'); assert false, 'revision numbers are unique';
  exception when unique_violation then null; end;
  assert not has_function_privilege('authenticated', 'public.kd_template_save(uuid, text, text, text, text, uuid)', 'execute'), 'service role only';
  assert not has_table_privilege('authenticated', 'public.email_template_overrides', 'select'), 'closed to clients';
end
$$;
