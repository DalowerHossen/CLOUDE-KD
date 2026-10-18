// path: services/branding/register.ts
// Lets the e-mail service use the company brand: colour, footer line and, on white-label plans, no platform wording.
import { registerBrandResolver } from '@/services/email/brand';
import { getTenantBrand } from './brand';

export default async function register(): Promise<void> {
  registerBrandResolver(async (companyId) => {
    const brand = await getTenantBrand(companyId);
    return {
      productName: brand.name || undefined,
      primaryColor: brand.primaryColor,
      footerText: brand.clientFooter || undefined,
    };
  });
}
