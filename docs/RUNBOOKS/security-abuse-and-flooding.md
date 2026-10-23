# Abuse, flooding and brute force

Trigger: rate-limit alerts, SIEM findings `auth.brute_force.ip`, `csrf.ip`, `injection.ip`, or a sudden rise of security events on `/admin/health`.

1. Open `/admin/security` and look at the events: type, masked address, count.
2. Single address or small group: ban the address for 24 hours. Repeated offenders are banned automatically by the zero-tolerance rules.
3. Distributed attack (many addresses): lower the limits for the affected route by changing `RATE_POLICIES` in `config/security.ts` and deploy, and ask the edge provider (Cloudflare) to raise the challenge level for the path. Do not whitelist the attacker's range.
4. Credential stuffing: check `/admin/fraud` for accounts with high risk scores and lock those that show a successful sign-in from a new device or country.
5. If the limiter reports the database unreachable, requests are refused (429). Restore the database first; do not disable the limiter.
6. After the attack, remove temporary bans that are no longer needed and note the cause in the incident.

Recovery check: event rate returns to its normal level, no failing sign-ins from the attack range, legitimate users can sign in.
