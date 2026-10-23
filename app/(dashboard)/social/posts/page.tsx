// path: app/(dashboard)/social/posts/page.tsx
import type { Metadata } from 'next';
import { ShareBar } from '@/components/social/share-bar';
import { ComposeForm, PostActionButton } from '@/components/social/social-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/social/accounts';
import { listGroups } from '@/services/social/hashtags';
import { listPosts, type PostView } from '@/services/social/posts';
import { SocialTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media posts' };

export default async function SocialPostsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_post');
  const companyId = actor.companyId as string;
  const canPost = await getService('permissions').can(actor, 'social.post', {
    type: 'social_post',
  });
  let data: {
    posts: PostView[];
    accounts: {
      id: string;
      label: string;
      provider: 'facebook' | 'instagram' | 'threads' | 'sandbox';
    }[];
    groups: { id: string; name: string }[];
  } | null;
  try {
    const [posts, accounts, groups] = await Promise.all([
      listPosts(companyId, { limit: 50 }),
      listAccounts(companyId),
      listGroups(companyId),
    ]);
    data = {
      posts,
      accounts: accounts
        .filter((a) => a.status === 'active')
        .map((a) => ({
          id: a.id,
          label: `${a.displayName} (${t(`s16Social.providers.${a.provider}` as StringKey)})`,
          provider: a.provider,
        })),
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.posts.title')}
        description={t('s16Social.posts.description')}
        actions={<SocialTabs current="/social/posts" />}
      />
      {canPost && data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Social.posts.composeTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ComposeForm accounts={data.accounts} groups={data.groups} />
          </CardContent>
        </Card>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : data.posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Social.posts.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Social.posts.columns.text')}</TableHead>
                  <TableHead>{t('s16Social.posts.columns.account')}</TableHead>
                  <TableHead>{t('s16Social.posts.columns.state')}</TableHead>
                  <TableHead>{t('s16Social.posts.columns.when')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-md break-words text-sm">{p.body || '-'}</TableCell>
                    <TableCell>{p.accountName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Social.posts.states.${p.status}` as StringKey)}
                      </Badge>
                      {p.approvalStatus !== 'none' ? (
                        <Badge variant="outline" className="mt-1">
                          {t(`s16Social.posts.approval.${p.approvalStatus}` as StringKey)}
                        </Badge>
                      ) : null}
                      {p.approvalReason && p.approvalStatus === 'rejected' ? (
                        <span className="block text-xs text-muted-foreground">
                          {p.approvalReason}
                        </span>
                      ) : null}
                      {p.lastError ? (
                        <span className="block text-xs text-muted-foreground">{p.lastError}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {(p.publishedAt ?? p.scheduledAt ?? p.createdAt)
                        .slice(0, 16)
                        .replace('T', ' ')}
                    </TableCell>
                    <TableCell>
                      {canPost ? (
                        <div className="flex flex-wrap items-start gap-2">
                          {p.status === 'draft' ||
                          p.status === 'scheduled' ||
                          p.status === 'failed' ? (
                            <PostActionButton
                              id={p.id}
                              action="publish"
                              label={t(
                                p.status === 'failed'
                                  ? 's16Social.posts.tryAgain'
                                  : 's16Social.posts.publish',
                              )}
                            />
                          ) : null}
                          {p.status === 'draft' ||
                          p.status === 'scheduled' ||
                          p.status === 'failed' ? (
                            <PostActionButton
                              id={p.id}
                              action="cancel"
                              variant="destructive"
                              label={t('s16Social.posts.cancel')}
                            />
                          ) : null}
                          {(p.status === 'draft' ||
                            p.status === 'scheduled' ||
                            p.status === 'failed') &&
                          (p.approvalStatus === 'none' || p.approvalStatus === 'rejected') ? (
                            <PostActionButton
                              id={p.id}
                              action="submit"
                              label={t('s16Social.posts.sendForApproval')}
                            />
                          ) : null}
                          {p.externalUrl ? (
                            <ShareBar url={p.externalUrl} title={p.body.slice(0, 80)} />
                          ) : null}
                          {p.externalUrl ? (
                            <a
                              href={p.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm underline"
                            >
                              {t('s16Social.posts.open')}
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
