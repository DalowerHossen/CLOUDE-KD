// path: components/client/branded-frame.tsx
import type { CSSProperties, ReactNode } from 'react';
import type { TenantBrand } from '@/services/branding/brand';
import { themeCssVars } from '@/services/branding/theme';

interface BrandedFrameProps {
  brand: TenantBrand;
  /** False when the page shell above already shows the company name (custom domain). */
  showName?: boolean;
  children: ReactNode;
}

/**
 * The tenant's look around a client page: colours and font as CSS variables, the logo, the footer line (the platform mark belongs to the page shell). Always drawn in the light theme so the colours keep the contrast that was checked.
 */
export function BrandedFrame({ brand, showName = true, children }: BrandedFrameProps): JSX.Element {
  const style = themeCssVars(brand) as CSSProperties;
  return (
    <div className="space-y-sp-16 rounded-lg bg-background text-foreground" style={style}>
      {brand.logoUrl || showName ? (
        <div className="flex items-center justify-center gap-sp-12 border-b pb-sp-12">
          {brand.logoUrl ? (
            // The logo address is our own route; a plain image keeps the payment page free of loaders and trackers.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="max-h-12 w-auto"
              width={160}
              height={48}
            />
          ) : null}
          {showName ? <span className="text-lead font-semibold">{brand.name}</span> : null}
        </div>
      ) : null}
      {children}
      {brand.clientFooter ? (
        <p className="text-center text-caption text-muted-foreground">{brand.clientFooter}</p>
      ) : null}
    </div>
  );
}
