// path: components/payment/processors/nmi/payment-component.tsx
'use client';
// Secure form of NMI, mode "payment_component": NMI's Payment Component (@nmipayments/nmi-pay-react) draws the card fields in
// its own frames and hands back a single-use payment token through `onPay` (docs/processors/nmi.md section 4). This component
// never sees card data; it passes the token on and answers `true` so that the component does not wait for the payment: the
// checkout sends the token to the server and shows the result itself. When the checkout allows a new try (the form is
// enabled again after a token was sent), the fields are cleared, because a token can be used once.
import { useEffect, useRef } from 'react';
import { NmiPayments, type NmiPaymentsRef } from '@nmipayments/nmi-pay-react';
import { cn } from '@/lib/utils/cn';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

export default function NmiPaymentComponentForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, submitLabel, disabled, onToken } = props;
  const widget = useRef<NmiPaymentsRef>(null);
  const sent = useRef(false);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });
  useEffect(() => {
    // The checkout switches the form back on after a failed payment: start again with empty fields.
    if (!disabled && sent.current) {
      sent.current = false;
      widget.current?.resetFields();
    }
  }, [disabled]);

  return (
    <div className={cn(disabled && 'pointer-events-none opacity-60')} aria-busy={disabled}>
      <NmiPayments
        ref={widget}
        tokenizationKey={clientConfig.tokenizationKey ?? ''}
        paymentMethods={['card']}
        payButtonText={submitLabel}
        onPay={async (event) => {
          sent.current = true;
          callback.current(event.token);
          return true;
        }}
      />
    </div>
  );
}
