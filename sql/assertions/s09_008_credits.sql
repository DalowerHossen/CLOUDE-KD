-- path: sql/assertions/s09_008_credits.sql
-- Credit notes: numbering, limits, issued notes are fixed, applying a credit or a deposit counts as a payment, applied
-- amounts never exceed what is left, other clients' credit is refused, applications are append only.
do $$
declare
  c uuid; cl uuid; cl2 uuid; a uuid; b uuid; other uuid; dep uuid; cn uuid; cn2 uuid; num text; r record; app uuid;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
  lines jsonb := '[{"description":"x","quantity":"1","unitPrice":"60","total":"60"}]';
begin
  insert into public.companies (name, slug) values ('Credit Co', 'credit-co') returning id into c;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Buyer', '10001', 'US') returning id into cl;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Other', '10001', 'US') returning id into cl2;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number) values (c, cl, bill, 100, 100, 'sent', 'INV-1') returning id into a;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number) values (c, cl, bill, 80, 80, 'sent', 'INV-2') returning id into b;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number) values (c, cl2, bill, 80, 80, 'sent', 'INV-3') returning id into other;

  insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, subtotal, total)
    values (c, cl, a, 'return', bill, '{}', lines, 60, 60) returning id into cn;
  begin insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, total) values (c, cl, a, 'return', bill, '{}', lines, 0); assert false, 'credit above zero';
  exception when check_violation then null; end;
  begin insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, total) values (c, cl, a, 'because', bill, '{}', lines, 5); assert false, 'known reasons';
  exception when check_violation then null; end;
  begin perform public.kd_credit_apply(c, 'credit_note', cn, b, 10, null); assert false, 'a draft cannot be applied';
  exception when invalid_parameter_value then null; end;

  num := public.kd_credit_issue(c, cn, 'CN-', false, 5, 1, 2026, '{"name":"Credit Co"}', null);
  assert num = 'CN-00001', 'first number';
  begin update public.credit_notes set total = 99 where id = cn; assert false, 'issued credit note is fixed';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_credit_issue(c, cn, 'CN-', false, 5, 1, 2026, '{}', null); assert false, 'issued once';
  exception when invalid_parameter_value then null; end;

  -- more than the invoice is refused
  insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, total) values (c, cl, a, 'goodwill', bill, '{}', lines, 50) returning id into cn2;
  begin perform public.kd_credit_issue(c, cn2, 'CN-', false, 5, 1, 2026, '{}', null); assert false, 'credits above the invoice total';
  exception when invalid_parameter_value then null; end;
  update public.credit_notes set total = 40 where id = cn2;
  assert public.kd_credit_issue(c, cn2, 'CN-', false, 5, 1, 2026, '{}', null) = 'CN-00002', 'numbers follow';

  -- apply to its own invoice, then to another invoice of the same client
  select * into r from public.kd_credit_apply(c, 'credit_note', cn, a, 25, null);
  assert r.invoice_status = 'partially_paid' and r.balance = 75, 'credit counts as payment';
  select * into r from public.kd_credit_apply(c, 'credit_note', cn, b, 35, null);
  assert r.balance = 45, 'applied to another invoice of the client';
  begin perform public.kd_credit_apply(c, 'credit_note', cn, b, 1, null); assert false, 'nothing left';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_credit_apply(c, 'credit_note', cn2, other, 5, null); assert false, 'another client';
  exception when invalid_parameter_value then null; end;
  assert (select applied_amount from public.credit_notes where id = cn) = 60, 'applied amount follows';
  begin perform public.kd_credit_void(c, cn, 'oops', null); assert false, 'applied credit cannot be voided';
  exception when invalid_parameter_value then null; end;
  perform public.kd_credit_void(c, cn2, 'wrong', null);
  assert (select status from public.credit_notes where id = cn2) = 'void';
  begin update public.credit_notes set status = 'issued' where id = cn2; assert false, 'void stays void';
  exception when insufficient_privilege then null; end;

  select id into app from public.credit_applications where source_id = cn limit 1;
  begin delete from public.credit_applications where id = app; assert false, 'applications are append only';
  exception when insufficient_privilege then null; end;

  -- deposits
  insert into public.invoices (company_id, client_id, kind, bill_to, total, amount_due, amount_paid, status, number) values (c, cl, 'deposit', bill, 50, 50, 50, 'paid', 'DEP-1') returning id into dep;
  begin perform public.kd_credit_apply(c, 'deposit', dep, other, 10, null); assert false, 'deposit of another client';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_credit_apply(c, 'deposit', dep, dep, 10, null); assert false, 'deposit to itself';
  exception when invalid_parameter_value then null; end;
  select * into r from public.kd_credit_apply(c, 'deposit', dep, b, 30, null);
  assert r.balance = 15, 'deposit offsets the final invoice';
  begin perform public.kd_credit_apply(c, 'deposit', dep, b, 21, null); assert false, 'only 20 of the deposit left';
  exception when invalid_parameter_value then null; end;
  select * into r from public.kd_credit_apply(c, 'deposit', dep, b, 15, null);
  assert r.invoice_status = 'paid', 'final invoice paid by deposit';
end
$$;
