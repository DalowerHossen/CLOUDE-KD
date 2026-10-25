// path: app/(dashboard)/template.tsx
import type { ReactNode } from 'react';
import { assertPageModuleEnabled } from '@/services/company/module-access';

/** Runs on every page change: a page of an optional module that is off for the company is "not found". */
export default async function DashboardTemplate({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  await assertPageModuleEnabled();
  return <>{children}</>;
}
