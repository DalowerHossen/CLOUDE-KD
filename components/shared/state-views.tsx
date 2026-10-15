// path: components/shared/state-views.tsx
import { AlertTriangle, CheckCircle2, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils/cn';

/** Loading state: skeleton blocks and a polite status message for screen readers. */
export function LoadingState({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('space-y-sp-12', className)}
    >
      <span className="sr-only">{t('s01Core.states.loadingTitle')}</span>
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Support reference (correlation id or digest) so users can quote it. */
  reference?: string | undefined;
  onRetry?: () => void;
  className?: string;
}

/** Error state with a retry action. Never shows technical details. */
export function ErrorState({
  title,
  description,
  reference,
  onRetry,
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-sp-12 rounded-lg border border-destructive/40 bg-card p-sp-32 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="text-h4 font-semibold">{title ?? t('s01Core.states.errorTitle')}</h2>
      <p className="max-w-md text-base text-muted-foreground">
        {description ?? t('s01Core.states.errorBody')}
      </p>
      {reference ? (
        <p className="text-caption text-muted-foreground">
          {t('s01Core.errors.reference')}: <span className="font-mono">{reference}</span>
        </p>
      ) : null}
      {onRetry ? <Button onClick={onRetry}>{t('s01Core.common.retry')}</Button> : null}
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  /** Call to action, for example a "Create invoice" button. */
  action?: ReactNode;
  className?: string;
}

/** Empty state with a call to action. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-sp-12 rounded-lg border border-dashed bg-card p-sp-32 text-center',
        className,
      )}
    >
      <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-h4 font-semibold">{title ?? t('s01Core.states.emptyTitle')}</h2>
      <p className="max-w-md text-base text-muted-foreground">
        {description ?? t('s01Core.states.emptyBody')}
      </p>
      {action}
    </div>
  );
}

/** Success state shown after a completed action. */
export function SuccessState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center gap-sp-12 rounded-lg border border-success/40 bg-card p-sp-32 text-center',
        className,
      )}
    >
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
      <h2 className="text-h4 font-semibold">{title ?? t('s01Core.states.successTitle')}</h2>
      <p className="max-w-md text-base text-muted-foreground">
        {description ?? t('s01Core.states.successBody')}
      </p>
      {action}
    </div>
  );
}
