// path: components/onboarding/checklist-card.tsx
import Link from 'next/link';
import { Check, Circle } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { ChecklistItem } from '@/services/company/onboarding';

/** Setup checklist with a progress bar. The dashboard home (STEP 09) can place it in its sidebar. */
export function ChecklistCard({
  items,
  percent,
}: {
  items: readonly ChecklistItem[];
  percent: number;
}): JSX.Element {
  return (
    <section
      aria-labelledby="checklist-title"
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="checklist-title" className="text-h4 font-semibold">
          {t('s07Company.onboarding.checklist.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('s07Company.onboarding.checklist.percent', { percent })}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('s07Company.onboarding.progress')}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {item.done ? (
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={item.done ? 'text-muted-foreground line-through' : ''}>
              {t(
                `s07Company.onboarding.checklist.${item.key}` as 's07Company.onboarding.checklist.profile',
              )}
            </span>
            <span className="sr-only">
              {item.done ? t('s07Company.onboarding.checklist.done') : ''}
            </span>
            {!item.done && item.href ? (
              <Link href={item.href} className="ml-auto underline">
                {t('s07Company.onboarding.checklist.open')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
