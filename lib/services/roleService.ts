import { supabase } from "../supabase";
import { Database } from "@/types/database.types";

type GlobalRole = Database['public']['Enums']['global_role'];
type ScopeType = Database['public']['Enums']['scope_type'];
type ContextRole = Database['public']['Enums']['contextual_role_type']

export type RpcResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };


export class RoleService {
    //admin-only: update user global role
    static async updateGlobalRole(targetUserId: string, newRole: GlobalRole, reason: string): Promise<RpcResult> {
        const { data, error } = await supabase.rpc('update_global_role', {
            target_user_id: targetUserId,
            new_role: newRole,
            reason: reason ?? null,
        });

        if (error) return {success: false, error: error.message};
        return {success: true, data};
    }

    // elder+: grant contextual role
    static async assignContextualRole(
        targetUserId: string,
        roleType: ContextRole,
        scopeType: ScopeType,
        scopeId: string,
        reason?: string
    ): Promise<RpcResult> {
        const { data, error } = await supabase.rpc('grant_contextual_role', {
        target_user_id: targetUserId,
        role_type: roleType,
        scope_type: scopeType,
        scope_id: scopeId,
        reason: reason ?? null,
        });
        if (error) return { success: false, error: error.message };
        return { success: true, data };
    }


    //edler+: grant or replace contextual role
    static async revokeContextualRole(
        targetUserId: string, 
        scopeType: ScopeType, 
        scopeId: string, 
        reason: string
    ): Promise<RpcResult> {
        const { data, error } = await supabase.rpc('revoke_contextual_role', {
            target_user_id: targetUserId,
            scope_type: scopeType,
            scope_id: scopeId,
            reason: reason ?? null,
        });

        if (error) return {success: false, error: error.message};
        return {success: true, data};
    }


}
