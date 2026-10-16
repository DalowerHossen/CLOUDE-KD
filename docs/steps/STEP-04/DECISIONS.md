# STEP 04 decisions

- D1 (04.1) CSP: scripts use a per-request nonce with 'strict-dynamic' and no 'unsafe-inline'. `style-src-attr 'unsafe-inline'` stays because React inline style props and the animation library need it; `<style>` elements carry the nonce. Trusted Types are sent as a report-only header first, because the Turnstile loader assigns a script URL as text; enforcement follows once the report shows no violation.
- D2 (04.1) The SSRF guard checks the address at socket open time (custom lookup) as well as before the request, so DNS rebinding cannot reach private addresses. Redirects are never followed.
