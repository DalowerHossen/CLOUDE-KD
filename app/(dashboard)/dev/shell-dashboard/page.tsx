// path: app/(dashboard)/dev/shell-dashboard/page.tsx
import { notFound } from 'next/navigation';
import { UiGallery } from '@/components/shared/ui-gallery';
import { isShellPreviewEnabled } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Development-only interface preview (APP_ENV=development and SHELL_PREVIEW=1). Returns 404 otherwise. */
export default function ShellPreviewPage(): JSX.Element {
  if (!isShellPreviewEnabled()) notFound();
  return (
    <div className="mx-auto max-w-5xl py-sp-24">
      <UiGallery />
    </div>
  );
}
