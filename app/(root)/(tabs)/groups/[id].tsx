// app/(root)/(tabs)/groups/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useStreamClient } from '@/providers/StreamProvider';
import { createStreamApi } from '@/lib/stream/api';
import { joinGroup, leaveGroup } from '@/lib/stream/helpers';

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'members' | 'private';
  memberCount: number;
  ministryName: string | null;
  teamName: string | null;
  createdByName: string | null;
  isMember: boolean;
  isLeader: boolean;
  members: Array<{
    id: string;
    name: string;
    avatar: string | null;
    role: string;
  }>;
}

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, isConnected } = useStreamClient();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const streamApi = React.useMemo(() => {
    const apiBase = process.env.EXPO_PUBLIC_API_URL;
    if (!apiBase) return null;

    return createStreamApi({
      apiBase,
      getAuthHeader: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return `Bearer ${session?.access_token || ''}`;
      },
    });
  }, []);

  useEffect(() => {
    loadGroupDetails();
  }, [id]);

  const loadGroupDetails = async () => {
    if (!id) return;

    try {
      // Load group details
      //DEBUG
      console.log('[DEBUG][groups/[id]] loadGroupDetails start', { groupId: id });
      const { data: groupData, error: groupError } = await supabase
        .from('group_chats')
        .select(`
          *,
          ministries!group_chats_ministry_id_fkey(name),
          teams!group_chats_team_id_fkey(name),
          profiles!group_chats_created_by_fkey(full_name)
        `)
        .eq('id', id)
        .single();

      if (groupError) throw groupError;
      //DEBUG
      console.log('[DEBUG][groups/[id]] groupData', {
        hasGroupData: !!groupData,
        streamChannelId: groupData?.stream_channel_id,
      });

      // Load members
      const { data: membersData } = await supabase
        .from('group_memberships')
        .select(`
          user_id,
          profiles!inner(id, full_name, profile_image_url, global_role)
        `)
        .eq('group_chat_id', id)
        .eq('is_active', true);
      //DEBUG
      console.log('[DEBUG][groups/[id]] membersData', {
        memberCount: membersData?.length ?? 0,
      });

      // Check if current user is a member
      const { data: { user } } = await supabase.auth.getUser();
      const isMember = membersData?.some(m => m.user_id === user?.id) || false;
      //DEBUG
      console.log('[DEBUG][groups/[id]] membership check', {
        userId: user?.id,
        isMember,
      });

      // Check if user is a leader
      const { data: roleData } = await supabase
        .from('contextual_roles')
        .select('role_type')
        .eq('user_id', user?.id || '')
        .eq('scope_type', 'group_chat')
        .eq('scope_id', id)
        .eq('is_active', true)
        .single();

      const isLeader = roleData?.role_type === 'group_leader';
      //DEBUG
      console.log('[DEBUG][groups/[id]] role check', {
        roleType: roleData?.role_type,
        isLeader,
      });

      // Format members list
      const members = (membersData || []).map(m => ({
        id: m.profiles.id,
        name: m.profiles.full_name || 'Unknown',
        avatar: m.profiles.profile_image_url,
        role: m.profiles.global_role || 'member'
      }));

      setGroup({
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        visibility: groupData.visibility,
        memberCount: members.length,
        ministryName: groupData.ministries?.name,
        teamName: groupData.teams?.name,
        createdByName: groupData.profiles?.full_name,
        isMember,
        isLeader,
        members: members.slice(0, 10) // Show first 10 members
      });
    } catch (error) {
      console.error('Error loading group details:', error);
    } finally {
      //DEBUG
      console.log('[DEBUG][groups/[id]] loadGroupDetails end', { groupId: id });
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!isConnected || !streamApi || !group) {
      alert('Unable to join group. Please try again.');
      return;
    }

    setActionLoading(true);
    try {
      //DEBUG
      console.log('[DEBUG][groups/[id]] handleJoinGroup start', {
        groupId: group.id,
        isConnected,
      });
      await joinGroup(client, streamApi, group.id);
      //DEBUG
      console.log('[DEBUG][groups/[id]] handleJoinGroup after joinGroup helper');
      await loadGroupDetails();
      
      // Navigate to chat
      router.replace({
        pathname: '/(root)/chat/channel',
        params: {
          channelId: group.id,
          channelType: 'team',
          channelName: group.name
        }
      });
    } catch (error) {
      console.error('Error joining group:', error);
      alert('Failed to join group');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!isConnected || !streamApi || !group) return;

    setActionLoading(true);
    try {
      //DEBUG
      console.log('[DEBUG][groups/[id]] handleLeaveGroup start', {
        groupId: group.id,
      });
      await leaveGroup(client, streamApi, group.id);
      //DEBUG
      console.log('[DEBUG][groups/[id]] handleLeaveGroup after leaveGroup helper');
      await loadGroupDetails();
      alert(`Left ${group.name}`);
    } catch (error) {
      console.error('Error leaving group:', error);
      alert('Failed to leave group');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenChat = () => {
    if (!group) return;
    //DEBUG
    console.log('[DEBUG][groups/[id]] handleOpenChat', {
      groupId: group.id,
    });
    
    router.push({
      pathname: '/(root)/chat/channel',
      params: {
        channelId: group.id,
        channelType: 'team',
        channelName: group.name
      }
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="px-4 py-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Image source={icons.backArrow} className="w-6 h-6" style={{ tintColor: '#4B5563' }} />
          </TouchableOpacity>
        </View>
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">Group not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const visibilityInfo = {
    public: { icon: '🌍', label: 'Public Group', description: 'Anyone can join this group' },
    members: { icon: '👥', label: 'Members Only', description: 'Church members can join' },
    private: { icon: '🔒', label: 'Private Group', description: 'Join by invitation only' }
  };

  const visibility = visibilityInfo[group.visibility];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Gradient */}
        <LinearGradient
          colors={['#A89BB5', '#8B7F97']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="pt-4 pb-8"
        >
          <TouchableOpacity 
            onPress={() => router.back()}
            className="px-4 mb-6"
          >
            <Image 
              source={icons.backArrow} 
              className="w-6 h-6" 
              style={{ tintColor: 'white' }}
            />
          </TouchableOpacity>

          <View className="px-6">
            <Text className="text-3xl font-JakartaBold text-white mb-2">
              {group.name}
            </Text>
            {(group.ministryName || group.teamName) && (
              <Text className="text-white/80 text-base">
                {group.ministryName || group.teamName}
              </Text>
            )}
            <View className="flex-row items-center mt-4">
              <View className="bg-white/20 px-3 py-1.5 rounded-full mr-3">
                <Text className="text-white font-JakartaSemiBold">
                  {group.memberCount} members
                </Text>
              </View>
              <View className="bg-white/20 px-3 py-1.5 rounded-full">
                <Text className="text-white font-JakartaSemiBold">
                  {visibility.icon} {visibility.label}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Content */}
        <View className="px-6 -mt-4">
          {/* Action Buttons */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            {group.isMember ? (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleOpenChat}
                  className="flex-1 bg-primary-500 py-3 rounded-xl"
                >
                  <Text className="text-white text-center font-JakartaSemiBold">
                    Open Chat
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLeaveGroup}
                  disabled={actionLoading}
                  className="bg-red-500 px-4 py-3 rounded-xl"
                >
                  {actionLoading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white font-JakartaSemiBold">Leave</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleJoinGroup}
                disabled={actionLoading}
                className="bg-primary-500 py-3 rounded-xl"
              >
                {actionLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-center font-JakartaSemiBold">
                    Join Group
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <Text className="text-xs text-gray-500 text-center mt-2">
              {visibility.description}
            </Text>
          </View>

          {/* Description */}
          <View className="bg-white rounded-2xl p-4 mb-4">
            <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-2">
              About
            </Text>
            <Text className="text-gray-700 leading-5">
              {group.description || 'No description available for this group.'}
            </Text>
          </View>

          {/* Group Leader */}
          {group.createdByName && (
            <View className="bg-white rounded-2xl p-4 mb-4">
              <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-2">
                Group Leader
              </Text>
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-primary-100 rounded-full items-center justify-center mr-3">
                  <Text className="text-primary-600 font-JakartaBold">
                    {group.createdByName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-gray-900 font-JakartaMedium">
                  {group.createdByName}
                </Text>
              </View>
            </View>
          )}

          {/* Members Preview */}
          {group.members.length > 0 && (
            <View className="bg-white rounded-2xl p-4 mb-6">
              <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-3">
                Members ({group.memberCount})
              </Text>
              {group.members.map((member) => (
                <View key={member.id} className="flex-row items-center mb-3">
                  <View className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-3">
                    {member.avatar ? (
                      <Image source={{ uri: member.avatar }} className="w-10 h-10 rounded-full" />
                    ) : (
                      <Text className="text-gray-600 font-JakartaBold">
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-JakartaMedium">
                      {member.name}
                    </Text>
                    <Text className="text-xs text-gray-500 capitalize">
                      {member.role}
                    </Text>
                  </View>
                </View>
              ))}
              {group.memberCount > 10 && (
                <Text className="text-sm text-gray-400 text-center mt-2">
                  +{group.memberCount - 10} more members
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
