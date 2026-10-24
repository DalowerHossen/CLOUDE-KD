// path: app/(dashboard)/social/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { AccountButton, ConnectAccountForm } from '@/components/social/social-forms';
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
import { listAccounts, type SocialAccountView } from '@/services/social/accounts';
import { listGroups, type HashtagGroupView } from '@/services/social/hashtags';
import { SocialTabs } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media' };

export default async function SocialAccountsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_account');
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'social.manage', { type: 'social_account' });
  const canPost = await permissions.can(actor, 'social.post', { type: 'social_hashtag_group' });
  let data: { accounts: SocialAccountView[]; groups: HashtagGroupView[] } | null;
  try {
    const [accounts, groups] = await Promise.all([listAccounts(companyId), listGroups(companyId)]);
    data = { accounts, groups };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.accounts.title')}
        description={t('s16Social.accounts.description')}
        actions={<SocialTabs current="/social" />}
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Social.accounts.connectTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectAccountForm />
          </CardContent>
        </Card>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : data.accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Social.accounts.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Social.accounts.columns.name')}</TableHead>
                  <TableHead>{t('s16Social.accounts.columns.network')}</TableHead>
                  <TableHead>{t('s16Social.accounts.columns.state')}</TableHead>
                  <TableHead>{t('s16Social.accounts.columns.token')}</TableHead>
                  <TableHead>{t('s16Social.accounts.columns.checked')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.displayName}</TableCell>
                    <TableCell>{t(`s16Social.providers.${a.provider}` as StringKey)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Social.accounts.states.${a.status}` as StringKey)}
                      </Badge>
                      {a.lastError ? (
                        <span className="block text-xs text-muted-foreground">{a.lastError}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.tokenLast4 ? `...${a.tokenLast4}` : '-'}
                      {a.tokenExpiresAt ? (
                        <span className="block text-muted-foreground">
                          {t('s16Social.accounts.expiresOn')} {a.tokenExpiresAt.slice(0, 10)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {a.lastCheckedAt ? a.lastCheckedAt.slice(0, 16).replace('T', ' ') : '-'}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <AccountButton
                            id={a.id}
                            version={a.version}
                            mode="check"
                            label={t('s16Social.accounts.check')}
                          />
                          <AccountButton
                            id={a.id}
                            version={a.version}
                            mode={a.status === 'active' ? 'pause' : 'resume'}
                            label={t(
                              a.status === 'active'
                                ? 's16Social.accounts.pause'
                                : 's16Social.accounts.resume',
                            )}
                          />
                          <ActionButton
                            endpoint={`/api/social/accounts/${a.id}`}
                            method="DELETE"
                            variant="destructive"
                            label={t('s16Social.accounts.remove')}
                            doneText={t('s16Social.accounts.removed')}
                          />
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
      {canManage && data && data.accounts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Social.posts.maxPerDay')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            {data.accounts.map((a) => (
              <div key={a.id} className="space-y-1">
                <p className="text-sm font-medium">{a.displayName}</p>
                <JsonForm
                  endpoint={`/api/social/accounts/${a.id}`}
                  method="PATCH"
                  emptyAsNull
                  fixed={{ version: a.version }}
                  submitLabel={t('s16Social.accounts.hashtagAdd')}
                  doneText={t('s16Social.common.done')}
                  fields={[
                    {
                      name: 'maxPostsPerDay',
                      label: t('s16Social.posts.maxPerDay'),
                      whole: true,
                      initial: a.maxPostsPerDay === null ? '' : String(a.maxPostsPerDay),
                    },
                  ]}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Social.accounts.hashtagsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          {data && data.groups.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {data.groups.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground">{g.tags.join(' ')}</span>
                  {canPost ? (
                    <ActionButton
                      endpoint={`/api/social/hashtags/${g.id}`}
                      method="DELETE"
                      label={t('s16Social.accounts.hashtagRemove')}
                      doneText={t('s16Social.common.done')}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('s16Social.accounts.hashtagEmpty')}</p>
          )}
          {canPost ? (
            <JsonForm
              endpoint="/api/social/hashtags"
              idempotent
              resetAfter
              submitLabel={t('s16Social.accounts.hashtagAdd')}
              doneText={t('s16Social.common.done')}
              fields={[
                { name: 'name', label: t('s16Social.accounts.hashtagName'), required: true },
                {
                  name: 'tags',
                  label: t('s16Social.accounts.hashtagTags'),
                  list: true,
                  required: true,
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
