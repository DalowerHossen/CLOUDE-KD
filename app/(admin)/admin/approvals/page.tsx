// path: app/(admin)/admin/approvals/page.tsx
import type { Metadata } from 'next';
import { ApprovalsPageBody } from '@/components/admin/approvals/approvals-page-body';
import { SoloModeToggle } from '@/components/admin/approvals/solo-mode-toggle';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  approvalListSchema,
  listApprovals,
  type ApprovalListPage,
} from '@/services/approval/queries';
import { isSoloMode } from '@/services/approval/solo-mode';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Approvals' };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('approval.read', 'platform', 'approval_request');
  const raw = await searchParams;
  const parsed = approvalListSchema.safeParse({
    status: first(raw.status),
    cursor: first(raw.cursor) ?? null,
  });
  let page: ApprovalListPage | null = null;
  if (parsed.success) {
    try {
      page = await listApprovals(await createServerSupabase(), parsed.data);
    } catch {
      page = null;
    }
  }
  const solo = actor.role === 'super_admin' ? await isSoloMode().catch(() => false) : null;
  return (
    <ApprovalsPageBody
      page={page}
      apiBase="/api/approvals/platform"
      basePath="/admin/approvals"
      status={parsed.success ? parsed.data.status : undefined}
      extra={solo === null ? null : <SoloModeToggle initial={solo} />}
    />
  );
}
