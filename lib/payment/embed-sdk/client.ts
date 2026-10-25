// path: lib/payment/embed-sdk/client.ts
// The merchant-side checkout SDK. It has no imports, so it can be compiled to one script file for a script tag
// (scripts/build-embed-sdk.mjs) and also imported by the React wrapper. It draws one iframe that shows the checkout page of
// this platform; card details are typed only inside the payment processor's own fields in that frame, so this code, and the
// merchant page, never see them. The merchant page learns the result through the event "kd-checkout-complete".

export interface CheckoutCompleteDetail {
  paymentId: string;
  status: string;
}

export interface CheckoutErrorDetail {
  code: 'unavailable' | 'forbidden' | 'network' | 'invalid_options';
  message: string;
}

export interface MountOptions {
  /** The token at the end of the payment link, for example the last part of https://app.example/pay/<token>. */
  paymentLinkToken: string;
  /** CSS selector of the element that receives the checkout. */
  containerSelector?: string;
  /** The element itself (used by the React wrapper); wins over the selector. */
  container?: HTMLElement;
  /** Address of the platform, for example https://app.example. Not needed when the script tag came from the platform. */
  baseUrl?: string;
  primaryColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  /** Where to send the payer after a successful payment. */
  returnUrl?: string;
  onComplete?: (detail: CheckoutCompleteDetail) => void;
  onError?: (detail: CheckoutErrorDetail) => void;
}

export interface CheckoutHandle {
  destroy: () => void;
}

const SOURCE = 'kd-checkout';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FONT_PATTERN = /^[A-Za-z0-9 ,-]{1,80}$/;

/** The address the script was loaded from, read once while the script runs. */
const scriptOrigin = ((): string | null => {
  try {
    const current = document.currentScript;
    if (current instanceof HTMLScriptElement && current.src) return new URL(current.src).origin;
  } catch {
    // no script element (npm use): the caller passes baseUrl
  }
  return null;
})();

function secureBase(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin;
  } catch {
    // fall through
  }
  return null;
}

function safeReturnUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function field(data: unknown, name: string): unknown {
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)[name]
    : undefined;
}

export function mountCheckout(options: MountOptions): CheckoutHandle {
  const container =
    options.container ??
    (options.containerSelector
      ? document.querySelector<HTMLElement>(options.containerSelector)
      : null);
  const base = secureBase(options.baseUrl) ?? scriptOrigin;
  let frame: HTMLIFrameElement | null = null;
  let stopped = false;

  const fail = (detail: CheckoutErrorDetail): void => {
    if (container) {
      container.textContent = '';
      const box = document.createElement('div');
      box.setAttribute('role', 'alert');
      box.textContent = detail.message;
      box.style.cssText =
        'font:14px system-ui,sans-serif;padding:12px;border:1px solid #d33;border-radius:6px;color:#a11';
      container.appendChild(box);
      container.dispatchEvent(
        new CustomEvent('kd-checkout-error', { detail, bubbles: true, composed: true }),
      );
    }
    options.onError?.(detail);
  };

  if (!container || !base || !TOKEN_PATTERN.test(options.paymentLinkToken)) {
    fail({
      code: 'invalid_options',
      message:
        'The checkout could not be started: check the token, the container and the base address.',
    });
    return { destroy: () => undefined };
  }
  const host: HTMLElement = container;
  const origin: string = base;
  const token = options.paymentLinkToken;

  const query = new URLSearchParams({ origin: window.location.origin });
  if (options.primaryColor && COLOR_PATTERN.test(options.primaryColor))
    query.set('primary', options.primaryColor);
  if (
    typeof options.borderRadius === 'number' &&
    Number.isInteger(options.borderRadius) &&
    options.borderRadius >= 0 &&
    options.borderRadius <= 32
  )
    query.set('radius', String(options.borderRadius));
  if (options.fontFamily && FONT_PATTERN.test(options.fontFamily))
    query.set('font', options.fontFamily);

  const onMessage = (event: MessageEvent): void => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== origin) return;
    const data: unknown = event.data;
    if (field(data, 'source') !== SOURCE) return;
    const type = field(data, 'type');
    if (type === 'resize') {
      const height = field(data, 'height');
      if (typeof height === 'number' && Number.isInteger(height) && height >= 120 && height <= 4000)
        frame.style.height = `${height}px`;
    } else if (type === 'redirect') {
      const url = field(data, 'url');
      if (typeof url === 'string' && url.startsWith('https://')) window.location.assign(url);
    } else if (type === 'complete') {
      const paymentId = field(data, 'paymentId');
      const status = field(data, 'status');
      if (typeof paymentId !== 'string' || typeof status !== 'string' || status.length > 40) return;
      const detail: CheckoutCompleteDetail = { paymentId, status };
      host.dispatchEvent(
        new CustomEvent('kd-checkout-complete', { detail, bubbles: true, composed: true }),
      );
      options.onComplete?.(detail);
      const target = status === 'captured' ? safeReturnUrl(options.returnUrl) : null;
      if (target) {
        target.searchParams.set('kd_payment_id', paymentId);
        target.searchParams.set('kd_status', status);
        window.location.assign(target.toString());
      }
    }
  };

  void (async () => {
    try {
      // Cheap check before any frame is drawn: is the link usable, and may this site show it?
      const response = await fetch(
        `${origin}/api/payment-links/embed/${encodeURIComponent(token)}`,
        {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
        },
      );
      if (stopped) return;
      if (response.status === 403)
        return fail({
          code: 'forbidden',
          message: 'This web site is not allowed to show this checkout.',
        });
      if (!response.ok)
        return fail({
          code: 'unavailable',
          message: 'This payment link is not available. It may have expired or been used.',
        });
      frame = document.createElement('iframe');
      frame.src = `${origin}/embed/${encodeURIComponent(token)}?${query.toString()}`;
      frame.title = 'Secure checkout';
      frame.setAttribute('allow', 'payment');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.style.cssText = 'width:100%;border:0;display:block;height:480px;color-scheme:normal';
      host.textContent = '';
      host.appendChild(frame);
      window.addEventListener('message', onMessage);
    } catch {
      if (!stopped)
        fail({
          code: 'network',
          message: 'The checkout could not be reached. Check your connection and try again.',
        });
    }
  })();

  return {
    destroy: () => {
      stopped = true;
      window.removeEventListener('message', onMessage);
      if (frame) frame.remove();
      frame = null;
    },
  };
}

/** Mounts every element that has data-kd-checkout="<token>" (script tag use without any code). */
export function mountAll(root: ParentNode = document): CheckoutHandle[] {
  const handles: CheckoutHandle[] = [];
  root.querySelectorAll<HTMLElement>('[data-kd-checkout]').forEach((element) => {
    const token = element.getAttribute('data-kd-checkout') ?? '';
    const radius = +(element.getAttribute('data-border-radius') ?? '');
    handles.push(
      mountCheckout({
        paymentLinkToken: token,
        container: element,
        ...(element.getAttribute('data-primary-color')
          ? { primaryColor: element.getAttribute('data-primary-color') ?? '' }
          : {}),
        ...(element.getAttribute('data-border-radius') && Number.isFinite(radius)
          ? { borderRadius: radius }
          : {}),
        ...(element.getAttribute('data-font-family')
          ? { fontFamily: element.getAttribute('data-font-family') ?? '' }
          : {}),
        ...(element.getAttribute('data-return-url')
          ? { returnUrl: element.getAttribute('data-return-url') ?? '' }
          : {}),
      }),
    );
  });
  return handles;
}
