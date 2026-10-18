// path: components/payment/processors/custom/index.tsx
'use client';
// Secure form of the custom adapter: the owner's hosted gateway page. The payer pays on the gateway's own page (opened in a new window);
// no card data is typed on this page. The payer then types the payment reference shown by the gateway,
// and only that number is handed to the platform, which verifies it against the invoice
// (docs/processors/custom.md section 4). No key tracking, no analytics.
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const CHECKOUT_PREFIX = 'https://';
const ORDER_NUMBER = /^[A-Za-z0-9._~-]{1,100}$/;

export default function CustomSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, disabled, onToken, onError } = props;
  const checkoutUrl = clientConfig.checkoutUrl ?? '';
  const known = checkoutUrl.startsWith(CHECKOUT_PREFIX);
  const [opened, setOpened] = useState(false);
  const [order, setOrder] = useState('');

  if (!known) return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;

  function open(): void {
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    setOpened(true);
  }

  function confirm(): void {
    const value = order.trim();
    if (ORDER_NUMBER.test(value)) onToken(value);
    else onError(t('s10Payments.checkout.failed'));
  }

  return (
    <div className="space-y-sp-12">
      <Button type="button" className="w-full" disabled={disabled} onClick={open}>
        {t('s10Payments.checkout.openHosted')}
      </Button>
      {opened ? (
        <div className="space-y-sp-12">
          <p className="text-sm text-muted-foreground">{t('s10Payments.checkout.hostedStep')}</p>
          <Input
                        autoComplete="off"
            aria-label={t('s10Payments.checkout.orderNumber')}
            placeholder={t('s10Payments.checkout.orderNumber')}
            value={order}
            maxLength={100}
            onChange={(event) => setOrder(event.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={disabled || !ORDER_NUMBER.test(order.trim())}
            onClick={confirm}
          >
            {t('s10Payments.checkout.confirmHosted')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
