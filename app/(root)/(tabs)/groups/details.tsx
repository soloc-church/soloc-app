// app/(root)/(tabs)/groups/details.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStreamClient } from '@/providers/StreamProvider';
import { icons } from '@/constants';

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'members' | 'private';
  memberCount: number;
  createdBy: string | null;
  creatorName: string | null;
  ministryName: string | null;
  teamName: string | null;
  isMember: boolean;
  streamChannelId: string | null;
}

export default function GroupDetailsScreen() {
  const params = useLocalSearchParams<{ groupId?: string, groupName?: string }>();
  const { client, isConnected } = useStreamClient();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (params.groupId) {
      loadGroupDetails();
    }
  }, [params.groupId]);

  const loadGroupDetails = async () => {
    try {
      //DEBUG
      console.log('[DEBUG][groups/details] loadGroupDetails start', {
        groupId: params.groupId,
      });
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: groupData, error } = await supabase
        .from('group_chats')
        .select(`
          *,
          profiles!group_chats_created_by_fkey(full_name),
          ministries!group_chats_ministry_id_fkey(name),
          teams!group_chats_team_id_fkey(name),
          group_memberships!group_memberships_group_chat_id_fkey(user_id)
        `)
        .eq('id', params.groupId)
        .single();

      if (error) throw error;

      //DEBUG
      console.log('[DEBUG][groups/details] groupData raw', {
        hasGroupData: !!groupData,
        memberCount: groupData?.group_memberships?.length ?? 0,
      });

      const members = groupData.group_memberships || [];
      const isMember = members.some((m: any) => m.user_id === user?.id);

      //DEBUG
      console.log('[DEBUG][groups/details] computed membership', {
        isMember,
        currentUserId: user?.id,
        memberIds: members.map((m: any) => m.user_id),
      });

      setGroup({
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        visibility: groupData.visibility,
        memberCount: members.length,
        createdBy: groupData.created_by,
        creatorName: groupData.profiles?.full_name,
        ministryName: groupData.ministries?.name,
        teamName: groupData.teams?.name,
        isMember,
        streamChannelId: groupData.stream_channel_id,
      });
    } catch (error) {
      console.error('Error loading group details:', error);
      Alert.alert('Error', 'Failed to load group details');
    } finally {
      //DEBUG
      console.log('[DEBUG][groups/details] loadGroupDetails end');
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!group || !isConnected) {
      Alert.alert('Error', 'Please wait for chat to connect');
      return;
    }

    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      //DEBUG
      console.log('[DEBUG][groups/details] handleJoinGroup start', {
        groupId: group.id,
        sessionHasToken: !!session?.access_token,
        userId: user?.id,
      });

      // Join via Stream API
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/stream-channels/join-group`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupChatId: group.id }),
      });

      if (!response.ok) throw new Error('Failed to join group');
      //DEBUG
      console.log('[DEBUG][groups/details] join-group response', {
        status: response.status,
      });

      // Add to database
      await supabase
        .from('group_memberships')
        .insert({ 
          group_chat_id: group.id, 
          user_id: user?.id 
        });
      //DEBUG
      console.log('[DEBUG][groups/details] membership insert complete', {
        groupId: group.id,
        userId: user?.id,
      });

      // Refresh group details
      await loadGroupDetails();
      
      Alert.alert('Success', `You've joined ${group.name}!`, [
        { text: 'View Chat', onPress: () => openGroupChat() }
      ]);
    } catch (error) {
      console.error('Error joining group:', error);
      Alert.alert('Error', 'Failed to join group');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestToJoin = async () => {
    if (!group) return;

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      //DEBUG
      console.log('[DEBUG][groups/details] handleRequestToJoin start', {
        groupId: group.id,
        userId: user?.id,
      });

      await supabase
        .from('join_requests')
        .insert({
          group_chat_id: group.id,
          user_id: user?.id,
          status: 'pending'
        });

      Alert.alert('Success', 'Your join request has been sent to the group leader.');
    } catch (error) {
      console.error('Error requesting to join:', error);
      Alert.alert('Error', 'Failed to send join request');
    } finally {
      //DEBUG
      console.log('[DEBUG][groups/details] handleRequestToJoin end');
      setActionLoading(false);
    }
  };

  const openGroupChat = () => {
    if (!group || !group.streamChannelId) return;
    //DEBUG
    console.log('[DEBUG][groups/details] openGroupChat', {
      groupId: group.id,
      streamChannelId: group.streamChannelId,
    });

    router.push({
      pathname: '/(root)/messages',
      params: {
        channelCid: group.streamChannelId,
        channelType: 'team'
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
        <View className="px-4 py-3 flex-row items-center bg-white">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Image
              source={icons.backArrow}
              className="w-6 h-6"
              style={{ tintColor: '#4B5563' }}
            />
          </TouchableOpacity>
          <Text className="text-xl font-JakartaBold text-gray-900">Group Details</Text>
        </View>
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-600">Group not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getVisibilityBadge = () => {
    switch (group.visibility) {
      case 'public':
        return { label: 'Public', bg: 'bg-green-100', text: 'text-green-700' };
      case 'members':
        return { label: 'Members Only', bg: 'bg-blue-100', text: 'text-blue-700' };
      case 'private':
        return { label: 'Private', bg: 'bg-purple-100', text: 'text-purple-700' };
    }
  };

  const visibilityStyle = getVisibilityBadge();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Image
            source={icons.backArrow}
            className="w-6 h-6"
            style={{ tintColor: '#4B5563' }}
          />
        </TouchableOpacity>
        <Text className="text-xl font-JakartaBold text-gray-900">Group Details</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Group Header */}
        <View className="bg-white p-6 mb-2">
          <Text className="text-2xl font-JakartaBold text-gray-900 mb-2">
            {group.name}
          </Text>
          
          <View className="flex-row items-center gap-2 mb-4">
            <View className={`${visibilityStyle.bg} px-3 py-1 rounded-full`}>
              <Text className={`text-sm font-JakartaMedium ${visibilityStyle.text}`}>
                {visibilityStyle.label}
              </Text>
            </View>
            {group.ministryName && (
              <View className="bg-gray-100 px-3 py-1 rounded-full">
                <Text className="text-sm text-gray-600">{group.ministryName}</Text>
              </View>
            )}
          </View>

          {group.description && (
            <Text className="text-gray-600 leading-5">
              {group.description}
            </Text>
          )}
        </View>

        {/* Group Info */}
        <View className="bg-white px-6 py-4 mb-2">
          <View className="py-3 border-b border-gray-100">
            <Text className="text-sm text-gray-500 mb-1">Members</Text>
            <Text className="text-base text-gray-900">{group.memberCount}</Text>
          </View>
          
          {group.creatorName && (
            <View className="py-3 border-b border-gray-100">
              <Text className="text-sm text-gray-500 mb-1">Created by</Text>
              <Text className="text-base text-gray-900">{group.creatorName}</Text>
            </View>
          )}
          
          {group.teamName && (
            <View className="py-3">
              <Text className="text-sm text-gray-500 mb-1">Team</Text>
              <Text className="text-base text-gray-900">{group.teamName}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action Button */}
      <View className="bg-white px-6 py-4 border-t border-gray-100">
        {group.isMember ? (
          <TouchableOpacity
            onPress={openGroupChat}
            className="bg-primary-500 py-3 rounded-xl"
          >
            <Text className="text-white font-JakartaSemiBold text-center text-base">
              Open Chat
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={group.visibility === 'members' ? handleRequestToJoin : handleJoinGroup}
            disabled={actionLoading || !isConnected}
            className={`${
              isConnected ? 'bg-primary-500' : 'bg-gray-300'
            } py-3 rounded-xl`}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-JakartaSemiBold text-center text-base">
                {group.visibility === 'members' ? 'Request to Join' : 'Join Group'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
