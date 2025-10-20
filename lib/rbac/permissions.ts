// lib/rbac/permissions.ts
import type { Authz } from '@/types/authz';

export const can = {
  openAdminPanel: (a: Authz | null) => !!a?.caps?.includes('open_admin'),
  
  approveMembership: (a: Authz | null) => !!a?.caps?.includes('approve_membership'),
  
  publishContent: (a: Authz | null) => !!a?.caps?.includes('publish_content'),
  
  manageTeam: (a: Authz | null, teamId: string) =>
    !!a?.contexts?.some(c =>
      c.scopeType === 'team' &&
      c.scopeId === teamId &&
      (c.caps?.includes('team_manage') || c.roles?.includes('team_leader'))
    ),
  
  assignInScope: (a: Authz | null, scopeType: 'ministry'|'team'|'group_chat', scopeId: string) => {
    if (a?.caps?.includes('role_assign_scoped')) {
      return true;
    }
    
    const needed =
      scopeType === 'ministry' ? 'ministry_manage' :
      scopeType === 'team'     ? 'team_manage'     :
                                 'group_manage';
    
    return !!a?.contexts?.some(c => 
      c.scopeType === scopeType && 
      c.scopeId === scopeId && 
      (c.caps?.includes(needed) || 
       c.roles?.includes(scopeType === 'ministry' ? 'ministry_leader' : 
                        scopeType === 'team' ? 'team_leader' : 
                        'group_leader'))
    );
  },
  
  // Additional helpers
  isElder: (a: Authz | null) => 
    a?.globalRole === 'elder' || a?.globalRole === 'pastor' || a?.globalRole === 'admin',
  
  isPastor: (a: Authz | null) => 
    a?.globalRole === 'pastor' || a?.globalRole === 'admin',
  
  isAdmin: (a: Authz | null) => 
    a?.globalRole === 'admin',
  
  isMember: (a: Authz | null) => 
    a?.globalRole === 'member' || a?.globalRole === 'elder' || 
    a?.globalRole === 'pastor' || a?.globalRole === 'admin',
  
  hasAuditAccess: (a: Authz | null) => 
    !!a?.caps?.includes('audit_read'),
  
  canManageMinistry: (a: Authz | null, ministryId?: string) => {
    if (a?.caps?.includes('ministry_manage')) return true;
    
    if (ministryId) {
      return !!a?.contexts?.some(c =>
        c.scopeType === 'ministry' &&
        c.scopeId === ministryId &&
        (c.caps?.includes('ministry_manage') || c.roles?.includes('ministry_leader'))
      );
    }
    
    return false;
  },
  
  canCreateGroup: (a: Authz | null) => {
    // Elders and above can create groups
    return a?.globalRole === 'elder' || a?.globalRole === 'pastor' || a?.globalRole === 'admin';
  },
  
  canManageGroup: (a: Authz | null, groupId?: string) => {
    // Global capability
    if (a?.caps?.includes('group_manage')) return true;
    
    // Contextual capability for specific group
    if (groupId) {
      return !!a?.contexts?.some(c =>
        c.scopeType === 'group_chat' &&
        c.scopeId === groupId &&
        (c.caps?.includes('group_manage') || c.roles?.includes('group_leader'))
      );
    }
    
    return false;
  }
};