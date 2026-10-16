// path: components/marketing/blocks/block-view.tsx
// Server components for every block type. Text is rendered as text (React escapes it); only the richtext block shows
// HTML, and only after the strict sanitizer.
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { SafeHtml } from '@/components/shared/safe-html';
import { Button } from '@/components/ui/button';
import { PLANS, PLAN_KEYS } from '@/config/plans';
import type { Block } from '@/lib/cms/blocks';
import { pricingColumns } from '@/lib/cms/pricing';
import { ContactForm } from '../contact-form';
import { BlockIcon } from './icons';

type Of<T extends Block['type']> = Extract<Block, { type: T }>;

const section = 'mx-auto w-full max-w-7xl px-sp-16 py-sp-48';
const heading2 = 'text-h2 font-semibold tracking-tight';

function Heading({
  text,
  intro,
  first,
}: {
  text: string;
  intro?: string;
  first?: boolean;
}): JSX.Element {
  const H = first ? 'h1' : 'h2';
  return (
    <div className="mb-sp-32 max-w-3xl space-y-2">
      <H className={first ? 'text-h1 font-bold tracking-tight' : heading2}>{text}</H>
      {intro ? <p className="text-lead text-muted-foreground">{intro}</p> : null}
    </div>
  );
}

function CtaLink({
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

function Hero({ b, first }: { b: Of<'hero'>; first: boolean }): JSX.Element {
  const H = first ? 'h1' : 'h2';
  return (
    <section className="bg-gradient-to-b from-muted/60 to-background">
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

function Features({ b }: { b: Of<'features'> }): JSX.Element {
  return (
    <section className={section} aria-labelledby={`h-${b.id}`}>
      <Heading text={b.heading} intro={b.intro} />
      <ul className="grid gap-sp-24 sm:grid-cols-2 lg:grid-cols-3">
        {b.items.map((item) => (
          <li key={item.title} className="space-y-2 rounded-lg border bg-card p-sp-24">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BlockIcon name={item.icon} />
            </span>
            <h3 className="text-h4 font-semibold">
              {item.href ? (
                <Link href={item.href} className="hover:underline">
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
            </h3>
            <p className="text-muted-foreground">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ b }: { b: Of<'steps'> }): JSX.Element {
  return (
    <section className="bg-muted/40">
      <div className={section}>
        <Heading text={b.heading} />
        <ol className="grid gap-sp-24 md:grid-cols-3">
          {b.items.map((item, i) => (
            <li key={item.title} className="space-y-2">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
              >
                {i + 1}
              </span>
              <h3 className="text-h4 font-semibold">{item.title}</h3>
              <p className="text-muted-foreground">{item.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PricingTeaser({ b }: { b: Of<'pricing_teaser'> }): JSX.Element {
  return (
    <section className={section}>
      <Heading text={b.heading} intro={b.intro} />
      <ul className="grid gap-sp-16 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_KEYS.map((key) => {
          const e = PLANS[key].entitlements;
          const inv = e['invoices.monthly'];
          return (
            <li key={key} className="space-y-2 rounded-lg border bg-card p-sp-24">
              <h3 className="text-h4 font-semibold">{PLANS[key].label}</h3>
              <p className="text-sm text-muted-foreground">
                {inv === null ? 'Unlimited invoices' : `${inv} invoices a month`}
              </p>
              <p className="text-sm text-muted-foreground">
                {e['clients.max'] === null ? 'Unlimited clients' : `${e['clients.max']} clients`}
              </p>
              <p className="text-sm text-muted-foreground">
                {e['staff.seats'] === null
                  ? 'Unlimited team members'
                  : `${e['staff.seats']} team member${e['staff.seats'] === 1 ? '' : 's'}`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-sp-16">
        <Link href="/pricing" className="text-primary hover:underline">
          Compare all plans
        </Link>
      </p>
    </section>
  );
}

function PricingTable({ b }: { b: Of<'pricing_table'> }): JSX.Element {
  const columns = pricingColumns();
  const rows = columns[0]?.cells.map((c) => c.label) ?? [];
  return (
    <section className={section}>
      <Heading text={b.heading} intro={b.intro} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">{b.heading}</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-sp-12 text-left font-semibold">
                Feature
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="p-sp-12 text-left font-semibold">
                  <span className="block">{c.label}</span>
                  {b.prices[c.key] ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {b.prices[c.key]}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((label, r) => (
              <tr key={label} className="border-t">
                <th scope="row" className="p-sp-12 text-left font-medium">
                  {label}
                </th>
                {columns.map((c) => {
                  const cell = c.cells[r];
                  return (
                    <td key={c.key} className="p-sp-12">
                      <span className="inline-flex items-center gap-1">
                        {cell?.included ? (
                          <Check className="h-4 w-4 text-success" aria-hidden="true" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className={cell?.included ? '' : 'text-muted-foreground'}>
                          {cell?.value}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.footnote ? (
        <p className="mt-sp-12 text-caption text-muted-foreground">{b.footnote}</p>
      ) : null}
    </section>
  );
}

function Testimonials({ b }: { b: Of<'testimonials'> }): JSX.Element | null {
  if (b.items.length === 0) return null;
  return (
    <section className="bg-muted/40">
      <div className={section}>
        <Heading text={b.heading} />
        <ul className="grid gap-sp-24 md:grid-cols-2 lg:grid-cols-3">
          {b.items.map((item) => (
            <li key={`${item.name}-${item.quote.slice(0, 12)}`}>
              <figure className="h-full space-y-3 rounded-lg border bg-card p-sp-24">
                <blockquote className="text-base">{item.quote}</blockquote>
                <figcaption className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{item.name}</strong>
                  {item.role || item.company
                    ? `, ${[item.role, item.company].filter(Boolean).join(', ')}`
                    : ''}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Trust({ b }: { b: Of<'trust'> }): JSX.Element {
  return (
    <section className="bg-muted/40">
      <div className={section}>
        <Heading text={b.heading} />
        <ul className="grid gap-sp-24 sm:grid-cols-2 lg:grid-cols-3">
          {b.items.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-1 text-primary">
                <BlockIcon name={item.icon} />
              </span>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq({ b }: { b: Of<'faq'> }): JSX.Element {
  return (
    <section className={section}>
      <Heading text={b.heading} />
      <div className="max-w-3xl divide-y rounded-lg border">
        {b.items.map((item) => (
          <details key={item.question} className="group p-sp-16">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              {item.question}
            </summary>
            <p className="mt-2 text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Cta({ b }: { b: Of<'cta'> }): JSX.Element {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className={`${section} space-y-sp-16 text-center`}>
        <h2 className={heading2}>{b.heading}</h2>
        {b.text ? <p className="mx-auto max-w-2xl text-lead opacity-90">{b.text}</p> : null}
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link href={b.button.href}>{b.button.label}</Link>
          </Button>
          {b.secondary ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link href={b.secondary.href}>{b.secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Jobs({ b }: { b: Of<'jobs'> }): JSX.Element {
  return (
    <section className={section}>
      <Heading text={b.heading} intro={b.intro} />
      {b.items.length === 0 ? (
        <p className="max-w-2xl rounded-lg border bg-card p-sp-24 text-muted-foreground">
          {b.emptyText}
        </p>
      ) : (
        <ul className="space-y-sp-12">
          {b.items.map((job) => (
            <li key={job.title} className="rounded-lg border bg-card p-sp-24">
              <h3 className="text-h4 font-semibold">{job.title}</h3>
              <p className="text-sm text-muted-foreground">
                {job.location} - {job.type}
              </p>
              <p className="mt-2">{job.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Columns({ b }: { b: Of<'columns'> }): JSX.Element {
  return (
    <section className={section}>
      <Heading text={b.heading} intro={b.intro} />
      <ul className="grid gap-sp-24 md:grid-cols-2">
        {b.items.map((item) => (
          <li key={item.title} className="space-y-2 rounded-lg border bg-card p-sp-24">
            <h3 className="text-h4 font-semibold">{item.title}</h3>
            <p className="text-muted-foreground">{item.text}</p>
            {item.bullets.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BlockView({ block, first }: { block: Block; first: boolean }): JSX.Element | null {
  switch (block.type) {
    case 'hero':
      return <Hero b={block} first={first} />;
    case 'features':
      return <Features b={block} />;
    case 'steps':
      return <Steps b={block} />;
    case 'pricing_teaser':
      return <PricingTeaser b={block} />;
    case 'pricing_table':
      return <PricingTable b={block} />;
    case 'testimonials':
      return <Testimonials b={block} />;
    case 'trust':
      return <Trust b={block} />;
    case 'faq':
      return <Faq b={block} />;
    case 'cta':
      return <Cta b={block} />;
    case 'richtext':
      return (
        <section className={section}>
          {block.heading ? <Heading text={block.heading} first={first} /> : null}
          <SafeHtml html={block.html} className="prose-content max-w-3xl space-y-sp-12" />
        </section>
      );
    case 'contact_form':
      return (
        <section className={section}>
          <Heading text={block.heading} intro={block.intro} first={first} />
          <ContactForm email={block.email} />
        </section>
      );
    case 'jobs':
      return <Jobs b={block} />;
    case 'columns':
      return <Columns b={block} />;
  }
}

export function BlockList({ blocks }: { blocks: readonly Block[] }): JSX.Element {
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={block.id} block={block} first={i === 0} />
      ))}
    </>
  );
}
