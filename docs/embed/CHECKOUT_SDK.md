# Embedded checkout for merchants

Show the payment page of a payment link inside your own web page. The payer never leaves your site (except for a bank
challenge that needs a full page). Card details are typed only inside the payment processor's own secure fields, which
live in a frame served by this platform. Your page and your servers never see card data.

## 1. Allow your web site

In the dashboard open Payments > Payment links > "Embedded checkout" and add the address of every site that will show the
checkout, for example `https://shop.example.com` (https only, no path, no wildcard; `http://localhost:3000` is accepted for
testing). A site that is not listed is refused (HTTP 403 from the API, and the browser will not draw the frame).

## 2. Get the token of a payment link

Create a payment link for an invoice. The address looks like `https://app.example/pay/<token>`. The last part is the token.
A link that is expired, revoked, already paid or has no balance left cannot be embedded (HTTP 404).

## 3. Add the checkout to your page

### Script tag

```html
<div id="checkout"></div>
<script src="https://app.example/embed/v1/kd-checkout.js"></script>
<script>
  KDCheckout.mount({
    paymentLinkToken: 'TOKEN',
    containerSelector: '#checkout',
    primaryColor: '#1a56db', // optional, #rrggbb
    borderRadius: 8, // optional, 0 to 32
    fontFamily: 'Inter, Arial', // optional
    returnUrl: 'https://shop.example.com/thanks', // optional
  });
</script>
```

Without any code: `<div data-kd-checkout="TOKEN" data-primary-color="#1a56db" data-return-url="https://shop.example.com/thanks"></div>`
followed by the script tag.

### React

The component `EmbedCheckout` (components/payment/embed-checkout.tsx, built on lib/payment/embed-sdk/client.ts) takes the
same options as props, plus `baseUrl` (the address of the platform):

```tsx
<EmbedCheckout
  baseUrl="https://app.example"
  paymentLinkToken={token}
  primaryColor="#1a56db"
  onComplete={({ paymentId, status }) => {
    /* ... */
  }}
/>
```

The two source files have no dependency on the rest of the platform except React; copy them into your project or publish
them as a package of your own (there is no ready-made npm package yet).

## 4. Know when the payment is done

The SDK fires a DOM event on the container (it bubbles, so you can listen on `document`):

```js
document.addEventListener('kd-checkout-complete', (e) => {
  const { paymentId, status } = e.detail; // status: 'captured', 'pending_review', 'failed', ...
});
```

and `kd-checkout-error` with `{ code, message }` (`forbidden`, `unavailable`, `network`, `invalid_options`).
When `returnUrl` is set and the status is `captured`, the page moves to it with `kd_payment_id` and `kd_status` added.

**Do not trust the browser for fulfilment.** Confirm the payment on your server through the signed webhook or the payments
API before you ship goods; the event is for the user interface only.

## 5. Bank challenge (3D Secure)

- A challenge that runs inside the processor's secure form (SDK challenge) happens in the frame, nothing to do.
- A challenge that needs a bank page: the frame asks your page to open the bank's https address; your page leaves, the payer
  finishes on the platform's own payment page (`/pay/<token>`), and sees the result there. `returnUrl` is not used for this
  path.

## What the platform checks

Link usable (404 otherwise), calling site listed (403 otherwise), payer routes accept only requests from the platform's own
pages, every payment started from the frame is written to the audit log with the site that showed it, and the frame page may
be shown only by the sites you listed (Content-Security-Policy `frame-ancestors`).
