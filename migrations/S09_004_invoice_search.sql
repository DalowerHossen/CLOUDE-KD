-- path: migrations/S09_004_invoice_search.sql
-- STEP 09.5 Invoice list: search, filters, sorting and keyset pages in one company-scoped function.

create index if not exists ix_invoices_issue on public.invoices (company_id, issue_date desc, id desc) where deleted_at is null;
create index if not exists ix_invoices_number_trgm on public.invoices using gin (lower(coalesce(number, '')) extensions.gin_trgm_ops) where deleted_at is null;

create or replace function public.kd_invoice_search(
  p_company uuid, p_q text, p_statuses text[], p_kind text, p_client uuid, p_from date, p_to date, p_min numeric, p_max numeric,
  p_trash boolean, p_sort text, p_desc boolean, p_after_value text, p_after_id uuid, p_limit integer
) returns table (id uuid, sort_value text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  expr text;
  typ text;
  dir text := case when p_desc then 'desc' else 'asc' end;
  cmp text := case when p_desc then '<' else '>' end;
  q text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
  amount numeric;
  sql text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 101 then p_limit := 26; end if;
  case p_sort
    when 'due' then expr := 'i.due_date'; typ := 'date';
    when 'amount' then expr := 'i.total'; typ := 'numeric';
    when 'status' then expr := 'i.status'; typ := 'text';
    when 'client' then expr := 'lower(coalesce(nullif(i.bill_to ->> ''name'', ''''), i.walk_in_name))'; typ := 'text';
    when 'number' then expr := 'coalesce(i.number, '''')'; typ := 'text';
    when 'created' then expr := 'i.created_at'; typ := 'timestamptz';
    else expr := 'i.issue_date'; typ := 'date';
  end case;
  if q is not null then
    pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if q ~ '^-?[0-9]{1,14}(\.[0-9]{1,4})?$' then amount := q::numeric; end if;
  end if;
  sql := format(
    'select i.id, (%1$s)::text from public.invoices i where i.company_id = $1
       and (($2 and i.deleted_at is not null) or (not $2 and i.deleted_at is null))
       and ($3::text[] is null or i.status = any ($3)) and ($4::text is null or i.kind = $4)
       and ($5::uuid is null or i.client_id = $5) and ($6::date is null or i.issue_date >= $6) and ($7::date is null or i.issue_date <= $7)
       and ($8::numeric is null or i.total >= $8) and ($9::numeric is null or i.total <= $9)
       and ($10::text is null or lower(coalesce(i.number, '''')) like $11 or lower(i.po_number) like $11
            or lower(coalesce(i.bill_to ->> ''name'', '''')) like $11 or lower(i.walk_in_name) like $11
            or ($12::numeric is not null and i.total = $12)
            or word_similarity(lower($10), lower(coalesce(nullif(i.bill_to ->> ''name'', ''''), i.walk_in_name))) > 0.4)
       and ($13::text is null or ((%1$s), i.id) %2$s (($13)::%3$s, $14))
     order by (%1$s) %4$s, i.id %4$s limit $15',
    expr, cmp, typ, dir);
  return query execute sql using p_company, coalesce(p_trash, false), p_statuses, p_kind, p_client, p_from, p_to, p_min, p_max,
    q, pat, amount, p_after_value, p_after_id, p_limit;
end
$$;
revoke all on function public.kd_invoice_search(uuid, text, text[], text, uuid, date, date, numeric, numeric, boolean, text, boolean, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.kd_invoice_search(uuid, text, text[], text, uuid, date, date, numeric, numeric, boolean, text, boolean, text, uuid, integer) to service_role;
