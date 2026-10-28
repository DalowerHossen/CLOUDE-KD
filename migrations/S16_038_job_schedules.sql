-- path: migrations/S16_038_job_schedules.sql
-- The database clock calls the rest of the app's jobs (cron/schedule.generated.ts) through kd_cron_ping (S16_037). The jobs that run every minute in the
-- schedule file run every five minutes here, to keep the number of calls to the host low; the four jobs that delete data by a retention rule are not scheduled
-- yet (retention-enforce, file-retention, email-purge, notification-purge). Safe to run twice: cron.schedule replaces a job of the same name.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.schedule('kd-approvals-escalate', '*/5 * * * *', $job$select public.kd_cron_ping('approvals-escalate')$job$);
  perform cron.schedule('kd-audit-integrity', '*/15 * * * *', $job$select public.kd_cron_ping('audit-integrity')$job$);
  perform cron.schedule('kd-queues-purge', '17 3 * * *', $job$select public.kd_cron_ping('queues-purge')$job$);
  perform cron.schedule('kd-worker-tick', '*/5 * * * *', $job$select public.kd_cron_ping('worker-tick')$job$);
  perform cron.schedule('kd-alert-escalation', '*/5 * * * *', $job$select public.kd_cron_ping('alert-escalation')$job$);
  perform cron.schedule('kd-rate-limits-purge', '23 * * * *', $job$select public.kd_cron_ping('rate-limits-purge')$job$);
  perform cron.schedule('kd-siem-forward-and-correlate', '*/5 * * * *', $job$select public.kd_cron_ping('siem-forward-and-correlate')$job$);
  perform cron.schedule('kd-tor-list-refresh', '11 */6 * * *', $job$select public.kd_cron_ping('tor-list-refresh')$job$);
  perform cron.schedule('kd-notification-digest', '5 6 * * *', $job$select public.kd_cron_ping('notification-digest')$job$);
  perform cron.schedule('kd-storage-health', '*/15 * * * *', $job$select public.kd_cron_ping('storage-health')$job$);
  perform cron.schedule('kd-storage-migrate', '*/5 * * * *', $job$select public.kd_cron_ping('storage-migrate')$job$);
  perform cron.schedule('kd-upload-session-purge', '23 * * * *', $job$select public.kd_cron_ping('upload-session-purge')$job$);
  perform cron.schedule('kd-blog-publish', '*/5 * * * *', $job$select public.kd_cron_ping('blog-publish')$job$);
  perform cron.schedule('kd-cms-publish', '*/5 * * * *', $job$select public.kd_cron_ping('cms-publish')$job$);
  perform cron.schedule('kd-admin-actions', '*/5 * * * *', $job$select public.kd_cron_ping('admin-actions')$job$);
  perform cron.schedule('kd-domain-check', '*/30 * * * *', $job$select public.kd_cron_ping('domain-check')$job$);
  perform cron.schedule('kd-kyc-sync', '*/15 * * * *', $job$select public.kd_cron_ping('kyc-sync')$job$);
  perform cron.schedule('kd-lifecycle', '*/5 * * * *', $job$select public.kd_cron_ping('lifecycle')$job$);
  perform cron.schedule('kd-support-sweep', '*/10 * * * *', $job$select public.kd_cron_ping('support-sweep')$job$);
  perform cron.schedule('kd-client-privacy', '*/5 * * * *', $job$select public.kd_cron_ping('client-privacy')$job$);
  perform cron.schedule('kd-stock-expiry', '10 6 * * *', $job$select public.kd_cron_ping('stock-expiry')$job$);
  perform cron.schedule('kd-po-approvals', '*/5 * * * *', $job$select public.kd_cron_ping('po-approvals')$job$);
  perform cron.schedule('kd-invoice-batches', '*/5 * * * *', $job$select public.kd_cron_ping('invoice-batches')$job$);
  perform cron.schedule('kd-estimate-expiry', '5 0 * * *', $job$select public.kd_cron_ping('estimate-expiry')$job$);
  perform cron.schedule('kd-fx-rates', '5 5 * * *', $job$select public.kd_cron_ping('fx-rates')$job$);
  perform cron.schedule('kd-invoice-approvals', '*/5 * * * *', $job$select public.kd_cron_ping('invoice-approvals')$job$);
  perform cron.schedule('kd-invoice-late-fees', '23 1 * * *', $job$select public.kd_cron_ping('invoice-late-fees')$job$);
  perform cron.schedule('kd-invoice-overdue', '17 * * * *', $job$select public.kd_cron_ping('invoice-overdue')$job$);
  perform cron.schedule('kd-invoice-recurring', '*/30 * * * *', $job$select public.kd_cron_ping('invoice-recurring')$job$);
  perform cron.schedule('kd-invoice-reminders', '7 * * * *', $job$select public.kd_cron_ping('invoice-reminders')$job$);
  perform cron.schedule('kd-report-schedules', '53 * * * *', $job$select public.kd_cron_ping('report-schedules')$job$);
  perform cron.schedule('kd-invoice-snapshots', '*/10 * * * *', $job$select public.kd_cron_ping('invoice-snapshots')$job$);
  perform cron.schedule('kd-time-release-claims', '41 * * * *', $job$select public.kd_cron_ping('time-release-claims')$job$);
  perform cron.schedule('kd-payment-upkeep', '*/5 * * * *', $job$select public.kd_cron_ping('payment-upkeep')$job$);
  perform cron.schedule('kd-payment-review-expiry', '*/10 * * * *', $job$select public.kd_cron_ping('payment-review-expiry')$job$);
  perform cron.schedule('kd-payment-webhook-retry', '*/5 * * * *', $job$select public.kd_cron_ping('payment-webhook-retry')$job$);
  perform cron.schedule('kd-contract-approvals', '*/5 * * * *', $job$select public.kd_cron_ping('contract-approvals')$job$);
  perform cron.schedule('kd-contract-cycle', '20 6 * * *', $job$select public.kd_cron_ping('contract-cycle')$job$);
  perform cron.schedule('kd-dispute-deadlines', '15 * * * *', $job$select public.kd_cron_ping('dispute-deadlines')$job$);
  perform cron.schedule('kd-estimate-expired-notes', '40 6 * * *', $job$select public.kd_cron_ping('estimate-expired-notes')$job$);
  perform cron.schedule('kd-bnpl-check', '20 6 * * *', $job$select public.kd_cron_ping('bnpl-check')$job$);
  perform cron.schedule('kd-client-billing', '50 * * * *', $job$select public.kd_cron_ping('client-billing')$job$);
  perform cron.schedule('kd-wallet-holds', '5 * * * *', $job$select public.kd_cron_ping('wallet-holds')$job$);
  perform cron.schedule('kd-payouts', '20 * * * *', $job$select public.kd_cron_ping('payouts')$job$);
  perform cron.schedule('kd-subscriptions', '35 * * * *', $job$select public.kd_cron_ping('subscriptions')$job$);
  perform cron.schedule('kd-plan-usage', '40 2 * * *', $job$select public.kd_cron_ping('plan-usage')$job$);
  perform cron.schedule('kd-asset-depreciation', '15 4 * * *', $job$select public.kd_cron_ping('asset-depreciation')$job$);
  perform cron.schedule('kd-budget-alerts', '45 5 * * *', $job$select public.kd_cron_ping('budget-alerts')$job$);
  perform cron.schedule('kd-expense-recurring', '30 5 * * *', $job$select public.kd_cron_ping('expense-recurring')$job$);
  perform cron.schedule('kd-payroll-repair', '20 6 * * *', $job$select public.kd_cron_ping('payroll-repair')$job$);
  perform cron.schedule('kd-accounting-recurring', '10 5 * * *', $job$select public.kd_cron_ping('accounting-recurring')$job$);
  perform cron.schedule('kd-tax-deadline-reminders', '50 5 * * *', $job$select public.kd_cron_ping('tax-deadline-reminders')$job$);
  perform cron.schedule('kd-bankfeed-sync', '17 * * * *', $job$select public.kd_cron_ping('bankfeed-sync')$job$);
  perform cron.schedule('kd-commerce-orders', '*/5 * * * *', $job$select public.kd_cron_ping('commerce-orders')$job$);
  perform cron.schedule('kd-integrations-housekeeping', '43 3 * * *', $job$select public.kd_cron_ping('integrations-housekeeping')$job$);
  perform cron.schedule('kd-messaging', '*/5 * * * *', $job$select public.kd_cron_ping('messaging')$job$);
  perform cron.schedule('kd-migration-jobs', '*/5 * * * *', $job$select public.kd_cron_ping('migration-jobs')$job$);
  perform cron.schedule('kd-ocr-jobs', '*/5 * * * *', $job$select public.kd_cron_ping('ocr-jobs')$job$);
  perform cron.schedule('kd-processor-health', '*/10 * * * *', $job$select public.kd_cron_ping('processor-health')$job$);
  perform cron.schedule('kd-social-hourly', '7 * * * *', $job$select public.kd_cron_ping('social-hourly')$job$);
  perform cron.schedule('kd-social-quarter-hour', '*/15 * * * *', $job$select public.kd_cron_ping('social-quarter-hour')$job$);
  perform cron.schedule('kd-social-publish', '*/5 * * * *', $job$select public.kd_cron_ping('social-publish')$job$);
  perform cron.schedule('kd-webhook-deliveries', '*/5 * * * *', $job$select public.kd_cron_ping('webhook-deliveries')$job$);
  perform cron.schedule('kd-whatsapp-due-soon', '17 8 * * *', $job$select public.kd_cron_ping('whatsapp-due-soon')$job$);
  perform cron.schedule('kd-whatsapp-automation', '*/5 * * * *', $job$select public.kd_cron_ping('whatsapp-automation')$job$);
end
$$;
