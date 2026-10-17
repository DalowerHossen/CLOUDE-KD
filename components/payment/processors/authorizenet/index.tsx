// path: components/payment/processors/authorizenet/index.tsx
'use client';
// Secure form of Authorize.Net: the hosted payment information form of Accept.js (AcceptUI). The payer clicks a button
// and types the card in Authorize.Net's own lightbox; this component only receives the one-time payment nonce
// (docs/processors/authorizenet.md section 4). No key tracking, no analytics. The script comes from Authorize.Net's own
// host (never bundled) and is loaded after the button exists, as the library requires.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils/cn';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const SCRIPT_URLS: ReadonlySet<string> = new Set([
  'https://jstest.authorize.net/v3/AcceptUI.js',
  'https://js.authorize.net/v3/AcceptUI.js',
]);
const HANDLER = 'kdAcceptUiResponse';

interface AcceptResponse {
  opaqueData?: { dataDescriptor?: string; dataValue?: string };
  messages?: { resultCode?: string };
}

type HandlerHost = Record<string, unknown>;

export default function AuthorizeNetSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, submitLabel, disabled, onToken, onError } = props;
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onToken, onError });
  useEffect(() => {
    callbacks.current = { onToken, onError };
  });
  const scriptUrl = clientConfig.scriptUrl ?? '';
  const apiLoginId = clientConfig.apiLoginId ?? '';
  const clientKey = clientConfig.clientKey ?? '';
  const known = SCRIPT_URLS.has(scriptUrl);

  useEffect(() => {
    if (!known) return;
    const host = window as unknown as HandlerHost;
    host[HANDLER] = (response: AcceptResponse): void => {
      const data = response.opaqueData;
      if (response.messages?.resultCode === 'Error' || !data?.dataDescriptor || !data.dataValue) {
        callbacks.current.onError(t('s10Payments.checkout.failed'));
        return;
      }
      callbacks.current.onToken(`${data.dataDescriptor}:${data.dataValue}`);
    };
    for (const old of document.querySelectorAll(`script[src="${scriptUrl}"]`)) old.remove();
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.charset = 'utf-8';
    script.async = true;
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);
    return () => {
      script.remove();
      delete host[HANDLER];
    };
  }, [scriptUrl, known]);

  if (failed || !known || apiLoginId === '' || clientKey === '')
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <button
      type="button"
      className={cn('AcceptUI w-full', buttonVariants())}
      disabled={disabled}
      data-apiLoginID={apiLoginId}
      data-clientKey={clientKey}
      data-billingAddressOptions='{"show":true,"required":true}'
      data-paymentOptions='{"showCreditCard":true,"showBankAccount":false}'
      data-acceptUIFormBtnTxt={submitLabel}
      data-responseHandler={HANDLER}
    >
      {submitLabel}
    </button>
  );
}
