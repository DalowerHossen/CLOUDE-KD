// path: components/layout/logo.tsx
import { cn } from '@/lib/utils/cn';
import { t } from '@/lib/i18n';

interface LogoProps {
  /** full = mark + name, icon = mark only. */
  variant?: 'full' | 'icon';
  /** auto follows the theme; light is for dark backgrounds; dark is for light backgrounds. */
  tone?: 'auto' | 'light' | 'dark';
  className?: string;
  /** Platform brand: a name and an image that replace the built-in ones (public site). */
  name?: string;
  imageUrl?: string | null;
}

const TONES = {
  auto: 'text-foreground',
  light: 'text-white',
  dark: 'text-slate-900',
} as const;

export function Logo({
  variant = 'full',
  tone = 'auto',
  className,
  name,
  imageUrl,
}: LogoProps): JSX.Element {
  const brandName = name ?? t('s01Core.brand.name');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold tracking-tight',
        TONES[tone],
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={brandName} className="h-8 w-auto shrink-0" />
      ) : (
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          role="img"
          aria-label={t('s01Core.brand.logoAlt')}
          className="shrink-0"
        >
          <rect width="32" height="32" rx="8" className="fill-primary" />
          <path
            d="M9 8h3v7l6-7h3.8l-6.2 7.2L22 24h-3.7l-4.6-6.6L12 19v5H9z"
            fill="hsl(var(--primary-foreground))"
          />
        </svg>
      )}
      {variant === 'full' ? <span className="text-lead leading-none">{brandName}</span> : null}
    </span>
  );
}
