// lib/services/auditService.ts
import { supabase } from '../supabase';
import { Database } from '@/types/database.types';

type RoleEvent = Database['public']['Tables']['role_events']['Row'];
type InactiveMember = Database['public']['Tables']['inactive_members']['Row'];

export class AuditService {
  /**
   * Get role change history
   */
  static async getRoleHistory(filters?: {
    targetUserId?: string;
    actorUserId?: string;
    roleType?: string;
    scopeId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    let query = supabase
      .from('role_events')
      .select(`
        *,
        actor:profiles!role_events_actor_id_fkey(full_name),
        target:profiles!role_events_target_id_fkey(full_name)
      `, { count: 'exact' })
      .order('timestamp', { ascending: false });

    if (filters?.targetUserId) {
      query = query.eq('target_id', filters.targetUserId);
    }

    if (filters?.actorUserId) {
      query = query.eq('actor_id', filters.actorUserId);
    }

    if (filters?.roleType) {
      query = query.eq('role_assigned', filters.roleType);
    }

    if (filters?.scopeId) {
      query = query.eq('scope_id', filters.scopeId);
    }

    if (filters?.startDate) {
      query = query.gte('timestamp', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('timestamp', filters.endDate.toISOString());
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(
        filters.offset, 
        filters.offset + (filters.limit || 10) - 1
      );
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { events: data || [], count };
  }

  /**
   * Get activity summary for a user
   */
  static async getUserActivitySummary(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [profile, roleChanges, groupMemberships] = await Promise.all([
      // Get profile with last activity
      supabase
        .from('profiles')
        .select('last_active_at, joined_date, is_active')
        .eq('id', userId)
        .single(),

      // Get recent role changes
      supabase
        .from('role_events')
        .select('*', { count: 'exact' })
        .eq('target_id', userId)
        .gte('timestamp', thirtyDaysAgo.toISOString()),

      // Get active group memberships
      supabase
        .from('group_memberships')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('is_active', true)
    ]);

    return {
      lastActive: profile.data?.last_active_at,
      joinedDate: profile.data?.joined_date,
      isActive: profile.data?.is_active,
      recentRoleChanges: roleChanges.count || 0,
      activeGroupMemberships: groupMemberships.count || 0
    };
  }

  /**
   * Mark member as inactive (soft delete)
   */
  static async markMemberInactive(
    userId: string, 
    reason?: string,
    canReactivate = true
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get profile data
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile) throw new Error('Profile not found');

    // Archive profile data
    const { error: archiveError } = await supabase
      .from('inactive_members')
      .insert({
        original_profile_id: userId,
        profile_data: profile,
        inactivity_reason: reason,
        marked_inactive_by: user.id,
        can_reactivate: canReactivate
      });

    if (archiveError) throw archiveError;

    // Mark profile as inactive
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Deactivate all group memberships
    await supabase
      .from('group_memberships')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Deactivate all contextual roles
    await supabase
      .from('contextual_roles')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Log the action
    await supabase
      .from('role_events')
      .insert({
        actor_id: user.id,
        target_id: userId,
        role_assigned: 'inactive',
        action: 'assigned',
        reason
      });

    return { success: true };
  }

  /**
   * Reactivate inactive member
   */
  static async reactivateMember(userId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if member can be reactivated
    const { data: inactive } = await supabase
      .from('inactive_members')
      .select('*')
      .eq('original_profile_id', userId)
      .single();

    if (!inactive) throw new Error('Inactive member record not found');
    if (!inactive.can_reactivate) throw new Error('Member cannot be reactivated');

    // Reactivate profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Log the reactivation
    await supabase
      .from('role_events')
      .insert({
        actor_id: user.id,
        target_id: userId,
        role_assigned: 'active',
        action: 'assigned',
        reason: 'Reactivated'
      });

    return { success: true };
  }

  /**
   * Get inactive members list
   */
  static async getInactiveMembers(filters?: {
    canReactivateOnly?: boolean;
    markedByUserId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    let query = supabase
      .from('inactive_members')
      .select(`
        *,
        marked_by:profiles!inactive_members_marked_inactive_by_fkey(full_name)
      `)
      .order('marked_inactive_at', { ascending: false });

    if (filters?.canReactivateOnly) {
      query = query.eq('can_reactivate', true);
    }

    if (filters?.markedByUserId) {
      query = query.eq('marked_inactive_by', filters.markedByUserId);
    }

    if (filters?.startDate) {
      query = query.gte('marked_inactive_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('marked_inactive_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Export audit logs
   */
  static async exportAuditLogs(format: 'json' | 'csv', filters?: Parameters<typeof AuditService.getRoleHistory>[0]) {
    const { events } = await this.getRoleHistory({
      ...filters,
      limit: 10000 // Max export limit
    });

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else {
      // CSV format
      const headers = [
        'timestamp',
        'action',
        'actor_name',
        'target_name',
        'role_assigned',
        'scope_type',
        'scope_id',
        'reason'
      ];

      const rows = events.map(event => [
        event.timestamp,
        event.action,
        event.actor?.full_name || 'System',
        event.target?.full_name || 'Unknown',
        event.role_assigned,
        event.scope_type || '',
        event.scope_id || '',
        event.reason || ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return csv;
    }
  }
}