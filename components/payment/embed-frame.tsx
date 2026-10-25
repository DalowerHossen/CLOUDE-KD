// path: components/payment/embed-frame.tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  EMBED_MESSAGE_SOURCE,
  hexToHslTokens,
  type EmbedMessage,
  type EmbedStyle,
} from '@/lib/payment/embed-sdk/rules';
import { CheckoutPanel } from './checkout-panel';

/**
 * The inside of the embedded checkout: the normal checkout panel plus the messages to the merchant page. Messages go only to
 * the merchant origin that the server already checked, never to "*". Card details exist only inside the processor's own
 * fields that the panel loads through CheckoutSlot.
 */
export function EmbedFrame({
  token,
  parentOrigin,
  style,
}: {
  token: string;
  parentOrigin: string;
  style: EmbedStyle;
}): JSX.Element {
  const root = useRef<HTMLDivElement>(null);

  const send = useCallback(
    (message: EmbedMessage): void => {
      if (window.parent !== window) window.parent.postMessage(message, parentOrigin);
    },
    [parentOrigin],
  );

  useEffect(() => {
    send({ source: EMBED_MESSAGE_SOURCE, type: 'ready' });
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let last = 0;
    const observer = new ResizeObserver(() => {
      const raw = element.offsetHeight + 2;
      const height = raw > 4000 ? 4000 : raw < 120 ? 120 : raw;
      if (height !== last) {
        last = height;
        send({ source: EMBED_MESSAGE_SOURCE, type: 'resize', height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [send]);

  const css = useMemo((): CSSProperties => {
    const vars: Record<string, string> = {};
    if (style.primary) {
      const tokens = hexToHslTokens(style.primary);
      vars['--primary'] = tokens.primary;
      vars['--primary-foreground'] = tokens.foreground;
      vars['--ring'] = tokens.primary;
    }
    if (typeof style.radius === 'number') vars['--radius-md'] = `${style.radius}px`;
    if (style.font) vars['fontFamily'] = style.font;
    return vars as CSSProperties;
  }, [style]);

  return (
    <div ref={root} style={css} className="bg-background p-sp-12 text-foreground">
      <CheckoutPanel
        token={token}
        embed={{
          parentOrigin,
          onComplete: ({ paymentId, status }) =>
            send({ source: EMBED_MESSAGE_SOURCE, type: 'complete', paymentId, status }),
          onRedirect: (url) => send({ source: EMBED_MESSAGE_SOURCE, type: 'redirect', url }),
        }}
      />
    </div>
  );
}
