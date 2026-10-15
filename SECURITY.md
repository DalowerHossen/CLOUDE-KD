# Security Policy

## Reporting a vulnerability

Send a private report to the project owner (security contact configured in the repository settings). Do not open a public issue. Include the affected route or file, the steps to reproduce, and the impact. We acknowledge reports within 2 business days.

## Principles

- Zero Trust: every request is authenticated, authorized and validated again.
- Zero Tolerance: injection, cross-site scripting, CSRF, token abuse and brute force trigger a security event, blocking and an alert.
- Secrets live only in environment variables or in the encrypted credential vault. They are never committed, logged or sent to the browser.
- Card numbers, expiry dates and security codes never reach our code or servers.
- Every table has row level security with default deny. Cross-tenant identifiers answer 404.
- Sensitive data and files are encrypted with AES-256-GCM before they are stored.
- The audit log is append-only, hash-chained and signed.

## Supported versions

Only the latest release on `integration` receives security fixes.
