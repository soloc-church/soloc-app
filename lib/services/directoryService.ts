// lib/services/directoryService.ts
import { supabase } from '../supabase';
import { Database } from '@/types/database.types';

type Ministry = Database['public']['Tables']['ministries']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type GroupChat = Database['public']['Tables']['group_chats']['Row'];
type JoinRequest = Database['public']['Tables']['join_requests']['Row'];

export class DirectoryService {
  /**
   * Get all ministries
   */
  static async getMinistries(onlyActive = true) {
    let query = supabase
      .from('ministries')
      .select('*')
      .order('name');

    if (onlyActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get teams for a specific ministry
   */
  static async getTeamsByMinistry(ministryId: string, onlyActive = true) {
    let query = supabase
      .from('teams')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('name');

    if (onlyActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get all group chats with visibility rules applied
   */
  static async getGroupChats(filters?: {
    visibility?: Database['public']['Enums']['visibility_type'];
    ministryId?: string;
    teamId?: string;
    onlyActive?: boolean;
  }) {
    let query = supabase
      .from('group_chats')
      .select(`
        *,
        ministry:ministries(name),
        team:teams(name),
        member_count:group_memberships(count)
      `)
      .order('name');

    if (filters?.visibility) {
      query = query.eq('visibility', filters.visibility);
    }

    if (filters?.ministryId) {
      query = query.eq('ministry_id', filters.ministryId);
    }

    if (filters?.teamId) {
      query = query.eq('team_id', filters.teamId);
    }

    if (filters?.onlyActive !== false) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get group chat details with membership info
   */
  static async getGroupChatDetails(groupId: string) {
    const { data: group, error: groupError } = await supabase
      .from('group_chats')
      .select(`
        *,
        ministry:ministries(name),
        team:teams(name),
        created_by_user:profiles!group_chats_created_by_fkey(full_name)
      `)
      .eq('id', groupId)
      .single();

    if (groupError) throw groupError;

    // Check if user is a member
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: membership } = await supabase
      .from('group_memberships')
      .select('*')
      .eq('group_chat_id', groupId)
      .eq('user_id', user.id)
      .single();

    // Get members count
    const { count: memberCount } = await supabase
      .from('group_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('group_chat_id', groupId)
      .eq('is_active', true);

    return {
      ...group,
      isMember: !!membership,
      memberCount: memberCount || 0
    };
  }

  /**
   * Join a group chat
   */
  static async joinGroupChat(groupId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check group visibility
    const { data: group } = await supabase
      .from('group_chats')
      .select('visibility')
      .eq('id', groupId)
      .single();

    if (!group) throw new Error('Group not found');

    if (group.visibility === 'request') {
      // Create join request
      const { data, error } = await supabase
        .from('join_requests')
        .insert({
          group_chat_id: groupId,
          user_id: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      return { type: 'request', data };
    } else {
      // Direct join for public/members groups
      const { data, error } = await supabase
        .from('group_memberships')
        .insert({
          group_chat_id: groupId,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      return { type: 'joined', data };
    }
  }

  /**
   * Leave a group chat
   */
  static async leaveGroupChat(groupId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('group_memberships')
      .update({ is_active: false })
      .eq('group_chat_id', groupId)
      .eq('user_id', user.id);

    if (error) throw error;
  }

  /**
   * Get user's group memberships
   */
  static async getUserGroups() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('group_memberships')
      .select(`
        group_chat:group_chats(
          *,
          ministry:ministries(name),
          team:teams(name)
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) throw error;
    return data?.map(item => item.group_chat) || [];
  }

  /**
   * Get pending join requests for user
   */
  static async getUserJoinRequests() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('join_requests')
      .select(`
        *,
        group_chat:group_chats(name)
      `)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Search across ministries, teams, and groups
   */
  static async searchDirectory(searchTerm: string) {
    const [ministries, teams, groups] = await Promise.all([
      supabase
        .from('ministries')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .eq('is_active', true)
        .limit(5),
      
      supabase
        .from('teams')
        .select('*, ministry:ministries(name)')
        .ilike('name', `%${searchTerm}%`)
        .eq('is_active', true)
        .limit(5),
      
      supabase
        .from('group_chats')
        .select('*, ministry:ministries(name), team:teams(name)')
        .ilike('name', `%${searchTerm}%`)
        .eq('is_active', true)
        .limit(10)
    ]);

    return {
      ministries: ministries.data || [],
      teams: teams.data || [],
      groups: groups.data || []
    };
  }
}