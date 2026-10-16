# SIEM or alert delivery failure

Trigger: `/admin/health` shows SIEM destinations failing, or an alert channel test fails, or on-call people report that no alert arrived.

1. Open `/admin/siem`. The destination shows the last error (status code or network error). Use "Send test" after each change.
2. Typical causes: expired token or key, changed endpoint, firewall change at the receiver, receiver rejects the batch size. Create a new destination with the corrected values and remove the old one; the new one starts from the newest event, so use the old cursor-based destination until the new one works if you need the backlog.
3. Events are kept in the database (`security_events`, append-only), so a destination that was down for a while receives the backlog in order once it works again (up to 1000 events per run, every 5 minutes).
4. Alert channels: `/admin/alerts` shows channels and the on-call roster. Send a test to each channel. E-mail goes to the on-call roster; check that the e-mail service is configured on `/admin/health`.
5. While delivery is down, check `/admin/alerts` and `/admin/siem` by hand every 30 minutes.

Recovery check: test messages arrive at every destination and channel, `failures` is back to zero.
