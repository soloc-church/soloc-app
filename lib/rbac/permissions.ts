// rbac/permissions.ts
import type { Authz } from '@/types/authz';

export const can = {
  openAdminPanel: (a: Authz | null) => !!a?.caps?.includes('open_admin'),
  approveMembership: (a: Authz | null) => !!a?.caps?.includes('approve_membership'),
  publishContent: (a: Authz | null) => !!a?.caps?.includes('publish_content'),
  manageTeam: (a: Authz | null, teamId: string) =>
    !!a?.contexts?.some(c =>
      c.scopeType === 'team' &&
      c.scopeId === teamId &&
      (c.caps?.includes('team_manage') || c.roles?.includes('leader'))
    ),
  assignInScope: (a: Authz | null, scopeType: 'ministry'|'team'|'group_chat', scopeId: string) => {
    const needed =
      scopeType === 'ministry' ? 'ministry_manage' :
      scopeType === 'team'     ? 'team_manage'     :
                                 'group_manage';
    return !!(
      a?.caps?.includes('role_assign_scoped') ||
      a?.contexts?.some(c => c.scopeType === scopeType && c.scopeId === scopeId && c.caps?.includes(needed))
    );
  },
};
