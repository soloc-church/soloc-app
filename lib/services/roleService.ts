// lib/services/roleService.ts
import { supabase } from "../supabase";
import { Database } from "@/types/database.types";

type GlobalRole = Database['public']['Enums']['global_role'];
type ScopeType = Database['public']['Enums']['scope_type'];
type ContextRole = Database['public']['Enums']['contextual_role_type'];

export type RpcResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };

export class RoleService {
  // Cache for reducing duplicate calls
  private static cache = new Map<string, { data: any; timestamp: number }>();
  private static CACHE_TTL = 60000; // 1 minute

  private static getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }

  private static getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private static setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // Clear cache when roles change
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Admin-only: Update user's global role
   */
  static async updateGlobalRole(
    targetUserId: string,
    newRole: GlobalRole,
    reason: string
  ): Promise<RpcResult> {
    try {
      const { data, error } = await supabase.rpc('update_global_role', {
        target_user_id: targetUserId,
        new_role: newRole,
        reason: reason ?? null,
      });

      if (error) throw error;

      // Clear cache after role change
      this.clearCache();
      
      return { success: true, data };
    } catch (error: any) {
      console.error('Error updating global role:', error);
      return { success: false, error: error.message || 'Failed to update role' };
    }
  }

  /**
   * Elder+: Grant contextual role
   */
  static async assignContextualRole(
    targetUserId: string,
    roleType: ContextRole,
    scopeType: ScopeType,
    scopeId: string,
    reason?: string
  ): Promise<RpcResult> {
    try {
      const { data, error } = await supabase.rpc('grant_contextual_role', {
        target_user_id: targetUserId,
        role_type: roleType,
        scope_type: scopeType,
        scope_id: scopeId,
        reason: reason ?? null,
      });

      if (error) throw error;

      this.clearCache();
      return { success: true, data };
    } catch (error: any) {
      console.error('Error assigning contextual role:', error);
      return { success: false, error: error.message || 'Failed to assign role' };
    }
  }

  /**
   * Elder+: Revoke contextual role
   */
  static async revokeContextualRole(
    targetUserId: string,
    scopeType: ScopeType,
    scopeId: string,
    reason?: string
  ): Promise<RpcResult> {
    try {
      const { data, error } = await supabase.rpc('revoke_contextual_role', {
        target_user_id: targetUserId,
        scope_type: scopeType,
        scope_id: scopeId,
        reason: reason ?? null,
      });

      if (error) throw error;

      this.clearCache();
      return { success: true, data };
    } catch (error: any) {
      console.error('Error revoking contextual role:', error);
      return { success: false, error: error.message || 'Failed to revoke role' };
    }
  }

  /**
   * Get user's contextual roles with caching
   */
  static async getUserContextualRoles(userId: string) {
    const cacheKey = this.getCacheKey('getUserContextualRoles', userId);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase.rpc('get_user_contextual_roles', {
        p_user_id: userId
      });

      if (error) throw error;

      this.setCache(cacheKey, data || []);
      return data || [];
    } catch (error) {
      console.error('Error getting contextual roles:', error);
      return [];
    }
  }

  /**
   * Get role history with full details (no additional queries needed)
   */
  static async getRoleHistory(userId: string, limit: number = 10) {
    const cacheKey = this.getCacheKey('getRoleHistory', userId, limit);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase.rpc('get_role_history', {
        p_user_id: userId,
        p_limit: limit
      });

      if (error) throw error;

      // Data already includes actor names from the RPC
      this.setCache(cacheKey, data || []);
      return data || [];
    } catch (error) {
      console.error('Error getting role history:', error);
      return [];
    }
  }

  /**
   * Batch operation: Get contextual role counts for multiple users
   */
  static async getContextualRoleCounts(userIds: string[]) {
    if (!userIds.length) return {};

    try {
      const { data, error } = await supabase.rpc('list_contextual_roles_counts', {
        p_user_ids: userIds
      });

      if (error) throw error;

      // Convert to map for easy lookup
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.user_id] = row.active_count;
      });

      return counts;
    } catch (error) {
      console.error('Error getting role counts:', error);
      return {};
    }
  }

  /**
   * List available scopes for role assignment
   */
  static async listScopes(scopeType: ScopeType) {
    const cacheKey = this.getCacheKey('listScopes', scopeType);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase.rpc('list_scopes', {
        p_scope_type: scopeType
      });

      if (error) throw error;

      this.setCache(cacheKey, data || []);
      return data || [];
    } catch (error) {
      console.error('Error listing scopes:', error);
      return [];
    }
  }

  /**
   * Search assignable members
   */
  static async searchAssignableMembers(query: string = '', limit: number = 50) {
    try {
      const { data, error } = await supabase.rpc('list_assignable_members', {
        q: query || null,
        p_limit: limit
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching members:', error);
      return [];
    }
  }
}