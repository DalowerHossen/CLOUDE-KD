-- path: sql/assertions/s16_005_social.sql
-- Social tables: RLS on; an account is unique per company, provider and id and a sandbox account has no token; a post needs text or
-- an image, https links, a time when scheduled, and an account of its company; a post moves one way, is fixed once it was sent to
-- the network, and published or cancelled posts are final; hashtag groups are unique by name.
do $$
declare
  c uuid; d uuid; a uuid; ad uuid; p uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('social_accounts', 'social_posts', 'social_hashtag_groups') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Soc Co', 'soc-co') returning id into c;
  insert into public.companies (name, slug) values ('Soc Other', 'soc-other') returning id into d;
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'facebook', 'My Page', '102290129340398', enc, 'abcd') returning id into a;
  insert into public.social_accounts (company_id, provider, display_name, external_id) values (c, 'sandbox', 'Test', 'sandbox-1');
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (d, 'facebook', 'Other Page', '102290129340399', enc, 'abcd') returning id into ad;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'facebook', 'Dup', '102290129340398', enc, 'abcd'); assert false, 'one account per page';
  exception when unique_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id) values (c, 'facebook', 'No token', '555'); assert false, 'a network account needs a token';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'sandbox', 'Sandbox with token', 'sb2', enc, 'abcd'); assert false, 'a sandbox account has no token';
  exception when check_violation then null; end;
  begin insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'myspace', 'x', '1', enc, 'abcd'); assert false, 'provider list';
  exception when check_violation then null; end;
  begin update public.social_accounts set external_id = '999' where id = a; assert false, 'id fixed';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.social_posts (company_id, account_id, body) values (c, a, 'Hello world') returning id into p;
  begin insert into public.social_posts (company_id, account_id, body) values (c, a, ''); assert false, 'text or image';
  exception when check_violation then null; end;
  insert into public.social_posts (company_id, account_id, image_url) values (c, a, 'https://example.test/a.jpg');
  begin insert into public.social_posts (company_id, account_id, body, link_url) values (c, a, 'x', 'http://example.test'); assert false, 'https link';
  exception when check_violation then null; end;
  begin insert into public.social_posts (company_id, account_id, body, status) values (c, a, 'x', 'scheduled'); assert false, 'scheduled needs time';
  exception when check_violation then null; end;
  begin insert into public.social_posts (company_id, account_id, body) values (c, ad, 'x'); assert false, 'account of another company';
  exception when no_data_found then null; end;
  begin insert into public.social_posts (company_id, account_id, body, status) values (c, a, 'x', 'published'); assert false, 'cannot start published';
  exception when object_not_in_prerequisite_state or check_violation then null; end;

  update public.social_posts set body = 'Edited' where id = p;
  update public.social_posts set status = 'scheduled', scheduled_at = now() + interval '1 day' where id = p;
  update public.social_posts set status = 'draft' where id = p;
  update public.social_posts set status = 'publishing', container_id = 'c1', publish_after = now() where id = p;
  begin update public.social_posts set body = 'Changed after sending' where id = p; assert false, 'content fixed while publishing';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.social_posts set status = 'published' where id = p; assert false, 'published needs its time and id';
  exception when check_violation then null; end;
  update public.social_posts set status = 'published', published_at = now(), external_id = 'post-1' where id = p;
  begin update public.social_posts set status = 'draft' where id = p; assert false, 'published is final';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.social_posts set last_error = 'x' where id = p; assert false, 'published does not change';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.social_posts (company_id, account_id, body) values (c, a, 'Second') returning id into p;
  begin update public.social_posts set status = 'published', published_at = now(), external_id = 'z' where id = p; assert false, 'draft cannot jump to published';
  exception when object_not_in_prerequisite_state then null; end;
  update public.social_posts set status = 'cancelled' where id = p;
  begin update public.social_posts set status = 'draft' where id = p; assert false, 'cancelled is final';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.social_hashtag_groups (company_id, name, tags) values (c, 'Launch', array['#launch', '#new']);
  begin insert into public.social_hashtag_groups (company_id, name, tags) values (c, 'LAUNCH', array['#x']); assert false, 'group name once';
  exception when unique_violation then null; end;
  begin insert into public.social_hashtag_groups (company_id, name, tags) values (c, 'Empty', array[]::text[]); assert false, 'tags needed';
  exception when check_violation then null; end;
end
$$;
