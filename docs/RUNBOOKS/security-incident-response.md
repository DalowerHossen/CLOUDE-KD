# Security incident response

Trigger: a critical alert, a SEV1 or SEV2 incident opened by the system or a person, or a report from a customer or researcher.

## Severity

| Level | Meaning | Acknowledge within | Post-mortem |
|---|---|---|---|
| SEV1 | Data exposure, account takeover at scale, payment fraud in progress | 15 minutes | Required |
| SEV2 | Active attack that is contained by controls, a single confirmed takeover | 1 hour | Required |
| SEV3 | Suspicious activity under review, no confirmed harm | 1 working day | Optional |
| SEV4 | Low-impact finding, hardening task | 1 week | Optional |

A critical alert opens a SEV1 incident by itself. All other incidents are opened on `/admin/incidents`.

## Steps

1. Acknowledge the alert on `/admin/alerts`. This stops escalation. Open or take the incident on `/admin/incidents` and move it to acknowledged: the first person to do so becomes the commander.
2. State the impact in the incident: who is affected, since when, which data. Set "started" to the earliest known event so the time to detect is right.
3. Contain first, investigate second:
   - Hostile address: ban it on `/admin/fraud` (ban address) or `/admin/security`.
   - Compromised user: lock the sign-in and end all sessions on `/admin/fraud`, or use the unlock workflow on `/admin/account-locks` later.
   - Leaked token: revoke it through the token service (see `security-token-leak.md`).
4. Preserve evidence. Security events, fraud signals, audit entries and the incident timeline cannot be edited. Export what you need from `/admin/siem` and the audit log before any clean-up.
5. Add a note to the timeline for every action and decision. Move the incident to mitigating when the attack is contained and to resolved when normal operation is confirmed.
6. Notify: the commander decides whether customers, partners or regulators must be told. Personal-data breaches have legal deadlines; ask the compliance owner at once.
7. Close only after the post-mortem is written (summary, impact, timeline, root cause, what went well, what went wrong, actions with owner and date). SEV1 and SEV2 cannot be closed without it.

## Confirm recovery

- `/admin/health` shows no critical or high alerts and no failing SIEM destination.
- The security events of the last hour show no new events of the attack type.
- Every action item of the post-mortem has an owner and a date.
