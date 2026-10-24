// path: components/payment/checkout-slot.tsx
'use client';
import { Suspense, lazy, type LazyExoticComponent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import type { ProcessorId } from '@/types/contracts';
import { secureFormLoaders } from './processors/index.generated';
import type { SecureFormComponent, SecureFormProps } from './secure-form-types';

/** One lazy component per secure form, created once when this module loads. */
const lazyForms: Partial<Record<ProcessorId, LazyExoticComponent<SecureFormComponent>>> =
  Object.fromEntries(Object.entries(secureFormLoaders).map(([id, loader]) => [id, lazy(loader)]));

interface Props extends SecureFormProps {
  processorId: ProcessorId;
}

/** Loads the secure form of the active processor. Card fields exist only inside that form. */
export function CheckoutSlot({ processorId, ...formProps }: Props): JSX.Element {
  const Form = lazyForms[processorId];
  if (!Form) {
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  }
  return (
    <Suspense
      fallback={
        <Skeleton className="h-40 w-full" aria-label={t('s10Payments.checkout.loadingForm')} />
      }
    >
      <Form {...formProps} />
    </Suspense>
  );
}
