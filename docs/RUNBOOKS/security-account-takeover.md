# Account takeover

Trigger: alert `security.account_takeover_signal`, a SIEM finding `takeover.actor`, a sign-in from a new country within two hours, or a report from the account owner.

1. Open a SEV2 incident (SEV1 if the account is a platform role or several accounts are affected).
2. On `/admin/fraud` find the user and run "End sessions", then "Lock sign-in". The lock holds even if the attacker knows the password.
3. Check recent actions of the account in the audit log: payments, payout changes, e-mail or password changes, new API keys, exports. List each one in the incident timeline.
4. Reverse harmful actions through the normal approval chain (staff, CEO, super admin). Never edit records directly.
5. Contact the owner through a channel that is not the account's e-mail if the e-mail was changed. Unlock only through the unlock workflow, which asks the owner to confirm by e-mail.
6. After unlock the user must set a new password and register the authenticator again. Old backup codes are replaced.
7. Look at the source address on `/admin/security`. If it is an anonymizing network or has other accounts, ban it and add its hash as an indicator on `/admin/siem`.

Recovery check: the user signs in with a new authenticator code, no new takeover signals appear for 24 hours.
