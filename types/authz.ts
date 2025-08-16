// types/authz.ts
export type Authz = {
  userId: string;
  globalRole: 'guest' | 'member' | 'elder' | 'pastor' | 'admin';
  caps: string[];
  contexts: Array<{
    scopeType: 'ministry' | 'team' | 'group_chat';
    scopeId: string;
    roles: string[];   // raw role names if you expose them
    caps: string[];    // derived capabilities for that scope
  }>;
};
