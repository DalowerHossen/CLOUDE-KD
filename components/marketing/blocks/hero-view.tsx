// path: components/marketing/blocks/hero-view.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Block } from '@/lib/cms/blocks';
import { HeroBackdrop } from '../art/illustrations';

export type HeroBlock = Extract<Block, { type: 'hero' }>;
const section = 'mx-auto w-full max-w-7xl px-sp-16 py-sp-48';

export function CtaLink({
  cta,
  variant,
}: {
  cta: { label: string; href: string };
  variant?: 'default' | 'outline';
}): JSX.Element {
  const external = cta.href.startsWith('https://') || cta.href.startsWith('mailto:');
  return (
    <Button asChild variant={variant ?? 'default'} size="lg">
      {external ? (
        <a href={cta.href} rel="noopener noreferrer">
          {cta.label}
        </a>
      ) : (
        <Link href={cta.href}>{cta.label}</Link>
      )}
    </Button>
  );
}

export function HeroView({ b, first }: { b: HeroBlock; first: boolean }): JSX.Element {
  const H = first ? 'h1' : 'h2';
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-muted/60 to-background">
      <HeroBackdrop />
      <div className={`${section} space-y-sp-16 py-sp-64`}>
        {b.eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{b.eyebrow}</p>
        ) : null}
        <H className="max-w-4xl text-display font-bold tracking-tight">{b.heading}</H>
        {b.subheading ? (
          <p className="max-w-3xl text-lead text-muted-foreground">{b.subheading}</p>
        ) : null}
        {b.primaryCta || b.secondaryCta ? (
          <div className="flex flex-wrap gap-3 pt-2">
            {b.primaryCta ? <CtaLink cta={b.primaryCta} /> : null}
            {b.secondaryCta ? <CtaLink cta={b.secondaryCta} variant="outline" /> : null}
          </div>
        ) : null}
        {b.note ? <p className="text-caption text-muted-foreground">{b.note}</p> : null}
      </div>
    </section>
  );
}
