// path: components/marketing/blocks/ab-hero.tsx
'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  CONVERSION_EVENT,
  assignedVariant,
  startExperiment,
  subscribeAb,
} from '@/lib/marketing/ab-store';
import { HeroView, type HeroBlock } from './hero-view';

/** A hero block that belongs to an A/B experiment. The control text is the server text; a variant replaces it. */
export function AbHero({ block, first }: { block: HeroBlock; first: boolean }): JSX.Element {
  const key = block.experiment ?? '';
  const variant = useSyncExternalStore(
    subscribeAb,
    () => assignedVariant(key),
    () => null,
  );
  useEffect(() => {
    if (key) void startExperiment(key);
  }, [key]);
  const shown: HeroBlock =
    variant && variant.key !== 'control'
      ? {
          ...block,
          ...(variant.heading ? { heading: variant.heading } : {}),
          ...(variant.subheading ? { subheading: variant.subheading } : {}),
          ...(variant.ctaLabel && block.primaryCta
            ? { primaryCta: { ...block.primaryCta, label: variant.ctaLabel } }
            : {}),
        }
      : block;
  return (
    <div
      onClick={(event) => {
        if ((event.target as Element).closest('a'))
          window.dispatchEvent(new CustomEvent(CONVERSION_EVENT, { detail: 'cta_click' }));
      }}
    >
      <HeroView b={shown} first={first} />
    </div>
  );
}
