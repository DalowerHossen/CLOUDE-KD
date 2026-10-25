// path: components/payment/embed-checkout.tsx
'use client';
// React wrapper of the merchant checkout SDK (lib/payment/embed-sdk/client.ts). A merchant's React app renders
// <EmbedCheckout paymentLinkToken="..." baseUrl="https://app.example" /> and listens for onComplete or for the DOM event
// "kd-checkout-complete". The wrapper draws one iframe; card details never enter the merchant's page.
import { useEffect, useRef } from 'react';
import {
  mountCheckout,
  type CheckoutCompleteDetail,
  type CheckoutErrorDetail,
} from '@/lib/payment/embed-sdk/client';

export interface EmbedCheckoutProps {
  paymentLinkToken: string;
  /** Address of the platform, for example https://app.example. */
  baseUrl: string;
  primaryColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  /** Where to send the payer after a successful payment. */
  returnUrl?: string;
  /** Optional CSS selector of another element to draw into; by default the component draws into its own element. */
  containerSelector?: string;
  className?: string;
  onComplete?: (detail: CheckoutCompleteDetail) => void;
  onError?: (detail: CheckoutErrorDetail) => void;
}

export function EmbedCheckout(props: EmbedCheckoutProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onComplete: props.onComplete, onError: props.onError });
  const { onComplete, onError } = props;
  useEffect(() => {
    handlers.current = { onComplete, onError };
  }, [onComplete, onError]);
  const { paymentLinkToken, baseUrl, primaryColor, borderRadius, fontFamily, returnUrl } = props;
  const { containerSelector } = props;

  useEffect(() => {
    const handle = mountCheckout({
      paymentLinkToken,
      baseUrl,
      ...(containerSelector
        ? { containerSelector }
        : host.current
          ? { container: host.current }
          : {}),
      ...(primaryColor ? { primaryColor } : {}),
      ...(typeof borderRadius === 'number' ? { borderRadius } : {}),
      ...(fontFamily ? { fontFamily } : {}),
      ...(returnUrl ? { returnUrl } : {}),
      onComplete: (detail) => handlers.current.onComplete?.(detail),
      onError: (detail) => handlers.current.onError?.(detail),
    });
    return () => handle.destroy();
  }, [
    paymentLinkToken,
    baseUrl,
    primaryColor,
    borderRadius,
    fontFamily,
    returnUrl,
    containerSelector,
  ]);

  return <div ref={host} className={props.className} />;
}
