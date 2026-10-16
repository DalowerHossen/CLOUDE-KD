// path: config/permissions/s06-site.ts
import type { PermissionDefinition } from '@/types/contracts';

const staff = ['super_admin', 'ceo', 'admin_staff'] as const;

export const permissions: PermissionDefinition[] = [
  {
    action: 'cms.read',
    description: 'See pages, versions and previews of the public site',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'cms.edit',
    description: 'Edit drafts of public pages and upload page media',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'cms.publish',
    description: 'Publish public pages (content managers need approval)',
    defaultRoles: [...staff],
    approvalLevel: 'L2',
  },
  {
    action: 'blog.read',
    description: 'See blog posts, drafts, authors, categories and tags',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'blog.edit',
    description: 'Write and edit blog posts, authors, categories and tags',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'blog.publish',
    description:
      'Publish, schedule, call back and delete blog posts (content managers need approval)',
    defaultRoles: [...staff],
    approvalLevel: 'L2',
  },
  {
    action: 'seo.read',
    description: 'See the SEO audit and the search settings of the public site',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'seo.edit',
    description: 'Change verification tags, social profiles and organization facts',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L1',
  },
  {
    action: 'analytics.read',
    description: 'See visit counters and which tracking providers are set',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'analytics.edit',
    description: 'Set the identifiers of tracking providers',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L1',
  },
];
