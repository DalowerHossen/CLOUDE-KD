// path: services/social/rules.ts
// Auto-post rules: "when this event is fired, make a post for these accounts from this text". The platform has no events of its
// own for new blog posts or products (see DEPENDENCY_REQUESTS R5), so a rule is started by a call that names the rule's trigger
// key and a source (for example the id of the blog post). Each source is handled once per rule. A new rule is off and is a dry
// run: it records the text it would have made. Only after the owner turns the dry run off does it make posts, as drafts or as
// posts that go out at once (still subject to approval where the company asks for it).
import 'server-only';
import { MAX_RULES_PER_COMPANY } from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { renderTemplate, unknownTokens } from '@/lib/social/automation';
import { problemsFor, withHashtags } from '@/lib/social/rules';
import { fireInput, ruleInput, ruleUpdate } from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getAccount } from './accounts';
import { need, record } from './db';
import { getGroup } from './hashtags';
import { makePost } from './make-post';

const COLUMNS =
  'id, name, trigger_key, account_ids, body_template, hashtag_group_id, mode, enabled, dry_run, version, created_at';

interface Row {
  id: string;
  name: string;
  trigger_key: string;
  account_ids: string[];
  body_template: string;
  hashtag_group_id: string | null;
  mode: string;
  enabled: boolean;
  dry_run: boolean;
  version: number;
  created_at: string;
}

export interface RuleView {
  id: string;
  name: string;
  triggerKey: string;
  accountIds: string[];
  bodyTemplate: string;
  hashtagGroupId: string | null;
  mode: 'draft' | 'publish';
  enabled: boolean;
  dryRun: boolean;
  version: number;
}

const toView = (r: Row): RuleView => ({
  id: r.id,
  name: r.name,
  triggerKey: r.trigger_key,
  accountIds: r.account_ids,
  bodyTemplate: r.body_template,
  hashtagGroupId: r.hashtag_group_id,
  mode: r.mode === 'publish' ? 'publish' : 'draft',
  enabled: r.enabled,
  dryRun: r.dry_run,
  version: r.version,
});

export async function listRules(companyId: string): Promise<RuleView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_RULES_PER_COMPANY);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('social_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

async function checkTemplate(
  companyId: string,
  template: string,
  accounts: string[],
  group: string | null,
): Promise<void> {
  const bad = unknownTokens(template);
  if (bad.length > 0)
    throw new ValidationError(
      `Unknown name in the text: ${bad.map((b) => `{${b}}`).join(' ')}. Use {title}, {url}, {summary} or {image}.`,
    );
  for (const id of new Set(accounts)) await getAccount(companyId, id);
  if (group) await getGroup(companyId, group);
}

export async function createRule(actor: Actor, input: unknown): Promise<RuleView> {
  const companyId = need(actor);
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The rule is not valid.');
  const d = parsed.data;
  await checkTemplate(companyId, d.bodyTemplate, d.accountIds, d.hashtagGroupId);
  if ((await listRules(companyId)).length >= MAX_RULES_PER_COMPANY)
    throw new ConflictError(`A company can have ${MAX_RULES_PER_COMPANY} rules at most.`);
  const { data, error } = await getAdminSupabase()
    .from('social_rules')
    .insert({
      company_id: companyId,
      name: d.name,
      trigger_key: d.triggerKey,
      account_ids: [...new Set(d.accountIds)],
      body_template: d.bodyTemplate,
      hashtag_group_id: d.hashtagGroupId,
      mode: d.mode,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const row = data as unknown as Row;
  await record(companyId, 'social.rule_created', 'social_rule', row.id, {
    trigger: d.triggerKey,
    mode: d.mode,
  });
  return toView(row);
}

export async function updateRule(actor: Actor, id: string, input: unknown): Promise<RuleView> {
  const companyId = need(actor);
  const parsed = ruleUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await rowOf(companyId, id);
  await checkTemplate(
    companyId,
    d.bodyTemplate ?? current.body_template,
    d.accountIds ?? current.account_ids,
    d.hashtagGroupId === undefined ? current.hashtag_group_id : d.hashtagGroupId,
  );
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.accountIds !== undefined) patch.account_ids = [...new Set(d.accountIds)];
  if (d.bodyTemplate !== undefined) patch.body_template = d.bodyTemplate;
  if (d.hashtagGroupId !== undefined) patch.hashtag_group_id = d.hashtagGroupId;
  if (d.mode !== undefined) patch.mode = d.mode;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  if (d.dryRun !== undefined) patch.dry_run = d.dryRun;
  const { data, error } = await getAdminSupabase()
    .from('social_rules')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new ConflictError('The rule changed. Reload and try again.');
  await record(companyId, 'social.rule_changed', 'social_rule', id, { fields: Object.keys(patch) });
  return toView(row);
}

export async function deleteRule(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await rowOf(companyId, id);
  const { error } = await getAdminSupabase()
    .from('social_rules')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'social.rule_removed', 'social_rule', id, {});
}

export interface RunView {
  id: string;
  ruleId: string;
  sourceKey: string;
  status: 'created' | 'dry_run' | 'skipped' | 'failed';
  reason: string | null;
  renderedText: string;
  postIds: string[];
  createdAt: string;
}

export async function listRuns(companyId: string, limit = 50): Promise<RunView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_rule_runs')
    .select('id, rule_id, source_key, status, reason, rendered_text, post_ids, created_at')
    .eq('company_id', companyId)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  const statuses = ['created', 'dry_run', 'skipped', 'failed'] as const;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    ruleId: String(r.rule_id),
    sourceKey: String(r.source_key),
    status: statuses.find((x) => x === r.status) ?? 'skipped',
    reason: r.reason === null ? null : String(r.reason),
    renderedText: String(r.rendered_text),
    postIds: (r.post_ids as string[] | null) ?? [],
    createdAt: String(r.created_at),
  }));
}

export interface FireResult {
  ruleId: string;
  ruleName: string;
  status: 'created' | 'dry_run' | 'skipped' | 'failed' | 'duplicate';
  postIds: string[];
  reason: string | null;
}

/** Fires a trigger: every enabled rule with this key handles the source once. */
export async function fireTrigger(actor: Actor, input: unknown): Promise<FireResult[]> {
  const companyId = need(actor);
  const parsed = fireInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The event is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('social_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('trigger_key', d.triggerKey)
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(MAX_RULES_PER_COMPANY);
  if (error) throw new InternalError(error);
  const results: FireResult[] = [];
  for (const rule of (data ?? []) as unknown as Row[]) {
    // The run row is the claim: a second call for the same source stops here.
    const claim = await admin
      .from('social_rule_runs')
      .insert({
        company_id: companyId,
        rule_id: rule.id,
        source_key: d.sourceKey,
        status: 'skipped',
        reason: 'Working on it.',
      })
      .select('id')
      .single();
    if (claim.error) {
      if (claim.error.code === '23505') {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'duplicate',
          postIds: [],
          reason: 'This source was handled before.',
        });
        continue;
      }
      throw new InternalError(claim.error);
    }
    const runId = String(claim.data.id);
    const text = renderTemplate(rule.body_template, {
      title: d.title,
      url: d.url,
      summary: d.summary,
      image: d.imageUrl,
    });
    const finish = async (
      status: 'created' | 'dry_run' | 'skipped' | 'failed',
      reason: string | null,
      postIds: string[],
    ): Promise<void> => {
      const r = await admin
        .from('social_rule_runs')
        .update({ status, reason, rendered_text: text.slice(0, 5000), post_ids: postIds })
        .eq('id', runId);
      if (r.error) throw new InternalError(r.error);
      results.push({ ruleId: rule.id, ruleName: rule.name, status, postIds, reason });
    };
    if (rule.dry_run) {
      await finish('dry_run', 'Dry run: nothing was made.', []);
      await record(companyId, 'social.rule_dry_run', 'social_rule', rule.id, {
        source: d.sourceKey,
      });
      continue;
    }
    try {
      const group = rule.hashtag_group_id
        ? await getGroup(companyId, rule.hashtag_group_id).catch(() => null)
        : null;
      const body = group ? withHashtags(text, group.tags) : text;
      const ids: string[] = [];
      const notes: string[] = [];
      for (const accountId of rule.account_ids) {
        const account = await getAccount(companyId, accountId).catch(() => null);
        if (!account || account.status !== 'active') {
          notes.push('An account is not active.');
          continue;
        }
        const problems = problemsFor(account.provider, {
          body,
          linkUrl: null,
          imageUrl: d.imageUrl,
        });
        if (problems.length > 0) {
          notes.push(`${account.displayName}: ${problems[0] ?? 'not valid'}`);
          continue;
        }
        const id = await makePost({
          companyId,
          accountId,
          body,
          linkUrl: null,
          imageUrl: d.imageUrl,
          scheduledAt: rule.mode === 'publish' ? new Date(Date.now() + 60_000).toISOString() : null,
          createdBy: actor.userId,
          ruleId: rule.id,
        });
        if (id !== null) ids.push(id);
      }
      await finish(
        ids.length > 0 ? 'created' : 'skipped',
        notes.length > 0 ? notes.join(' ').slice(0, 300) : null,
        ids,
      );
    } catch {
      await finish('failed', 'The posts could not be made.', []);
    }
    await record(companyId, 'social.rule_fired', 'social_rule', rule.id, { source: d.sourceKey });
  }
  return results;
}
