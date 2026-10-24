-- path: sql/assertions/s16_013_social_networks.sql
-- Accounts of LinkedIn, X, Telegram and Pinterest: each network accepts the id shape it uses and refuses the others.
do $$
declare
  c uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  insert into public.companies (name, slug) values ('Nets Co', 'nets-co') returning id into c;
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'linkedin', 'LI', 'urn:li:organization:5515715', enc, 'abcd');
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'x', 'X', '1880028106020515840', enc, 'abcd');
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'telegram', 'TG', '-1001234567890', enc, 'abcd');
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'telegram', 'TG2', '@kd_channel', enc, 'abcd');
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'pinterest', 'PIN', '549755885175', enc, 'abcd');
  select count(*) into n from public.social_accounts where company_id = c;
  assert n = 5, 'five accounts of the new networks';
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'linkedin', 'Bad', '5515715', enc, 'abcd'); assert false, 'linkedin needs a URN';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'x', 'Bad', 'someone', enc, 'abcd'); assert false, 'x needs a numeric id';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'telegram', 'Bad', 'channel', enc, 'abcd'); assert false, 'telegram needs a chat id or @name';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'pinterest', 'Bad', 'board-1', enc, 'abcd'); assert false, 'pinterest needs a numeric board id';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'facebook', 'Bad', 'urn:li:person:1', enc, 'abcd'); assert false, 'facebook keeps its shape';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'myspace', 'Bad', '1', enc, 'abcd'); assert false, 'provider list';
  exception when check_violation then null; end;
end
$$;
