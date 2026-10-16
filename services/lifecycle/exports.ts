// path: services/lifecycle/exports.ts
// Registers the tables of STEP 07 for tenant exports. Other STEPs register their own tables the same way.
import { registerTenantExport } from '@/lib/lifecycle/registry';

registerTenantExport({
  table: 'companies',
  label: 'company',
  columns: ['id', 'name', 'slug', 'plan_key', 'status', 'country_code', 'created_at'],
});
registerTenantExport({
  table: 'company_settings',
  label: 'settings',
  columns: ['section', 'value', 'created_at', 'updated_at', 'version'],
});
registerTenantExport({
  table: 'company_milestones',
  label: 'milestones',
  columns: ['milestone', 'achieved_at'],
});
registerTenantExport({
  table: 'profiles',
  label: 'people',
  columns: ['user_id', 'email', 'full_name', 'timezone', 'status', 'created_at'],
});
registerTenantExport({
  table: 'memberships',
  label: 'memberships',
  columns: ['user_id', 'role', 'granted_permissions', 'status', 'created_at'],
});
registerTenantExport({
  table: 'custom_domains',
  label: 'domains',
  columns: ['hostname', 'status', 'is_primary', 'verified_at', 'created_at'],
});
registerTenantExport({
  table: 'team_invitations',
  label: 'invitations',
  columns: ['email', 'preset', 'status', 'expires_at', 'created_at'],
});
