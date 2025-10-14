// app/(root)/(tabs)/groups/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { useAuthz } from '@/hooks/useAuthz';
import { can } from '@/lib/rbac/permissions';
import { LinearGradient } from 'expo-linear-gradient';
import { useStreamClient } from '@/providers/StreamProvider';

interface GroupChat {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'members' | 'private';
  memberCount: number;
  gatheringDays: string[] | null;
  ministryName: string | null;
  teamName: string | null;
  isMember: boolean;
  hasSubteams: boolean;
  streamChannelId: string | null;
  lastActivity?: string;
}

export default function GroupsScreen() {
  const { authz } = useAuthz();
  const { client, isConnected } = useStreamClient();
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'joined' | 'public'>('all');
  const canCreateGroup = can.manageGroupChat(authz);

  useEffect(() => {
    loadGroups();
  }, [activeFilter]);

  const loadGroups = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      // Get groups based on filter
      let query = supabase
        .from('group_chats')
        .select(`
          id,
          name,
          description,
          visibility,
          gathering_days,
          stream_channel_id,
          ministries!group_chats_ministry_id_fkey(name),
          teams!group_chats_team_id_fkey(name),
          group_chat_members!left(user_id)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (activeFilter === 'public') {
        query = query.eq('visibility', 'public');
      }

      const { data: groups, error } = await query;

      if (error) throw error;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      const formattedGroups: GroupChat[] = (groups || []).map(group => {
        const members = group.group_chat_members || [];
        const isMember = members.some((m: any) => m.user_id === user?.id);
        
        // Filter for 'joined' tab
        if (activeFilter === 'joined' && !isMember) {
          return null;
        }

        return {
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          memberCount: members.length,
          gatheringDays: group.gathering_days,
          ministryName: group.ministries?.name,
          teamName: group.teams?.name,
          isMember,
          hasSubteams: false, // You can add logic for this
          streamChannelId: group.stream_channel_id,
        };
      }).filter(Boolean) as GroupChat[];

      setGroups(formattedGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleJoinGroup = async (group: GroupChat) => {
    if (!isConnected) {
      alert('Please wait for chat to connect');
      return;
    }

    try {
      // Join via Stream API
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/stream-channels/join-group`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupChatId: group.id }),
      });

      if (!response.ok) throw new Error('Failed to join group');

      // Add to local state
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('group_chat_members')
        .insert({ group_chat_id: group.id, user_id: user?.id });

      // Refresh groups
      await loadGroups();
      
      alert(`Successfully joined ${group.name}!`);
    } catch (error) {
      console.error('Error joining group:', error);
      alert('Failed to join group');
    }
  };

  const handleLeaveGroup = async (group: GroupChat) => {
    if (!isConnected) {
      alert('Please wait for chat to connect');
      return;
    }

    try {
      // Leave via Stream API
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/stream-channels/leave-group`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupChatId: group.id }),
      });

      if (!response.ok) throw new Error('Failed to leave group');

      // Remove from database
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('group_chat_members')
        .delete()
        .eq('group_chat_id', group.id)
        .eq('user_id', user?.id);

      // Refresh groups
      await loadGroups();
      
      alert(`Left ${group.name}`);
    } catch (error) {
      console.error('Error leaving group:', error);
      alert('Failed to leave group');
    }
  };

  const getVisibilityStyle = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return { bg: 'bg-green-50', text: 'text-green-600', icon: '🌍' };
      case 'members':
        return { bg: 'bg-blue-50', text: 'text-blue-600', icon: '👥' };
      case 'private':
        return { bg: 'bg-purple-50', text: 'text-purple-600', icon: '🔒' };
      default:
        return { bg: 'bg-gray-50', text: 'text-gray-600', icon: '?' };
    }
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderGroup = ({ item }: { item: GroupChat }) => {
    const visibilityStyle = getVisibilityStyle(item.visibility);

    return (
      <TouchableOpacity
        className="mx-4 mb-3"
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={['#FFFFFF', '#FAFAFA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-2xl p-4 border border-gray-100"
        >
          {/* Header */}
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <Text className="text-lg font-JakartaBold text-gray-900" numberOfLines={1}>
                {item.name}
              </Text>
              
              {/* Tags */}
              <View className="flex-row items-center gap-2 mt-2 flex-wrap">
                {/* Visibility Badge */}
                <View className={`px-2 py-1 rounded-full ${visibilityStyle.bg} flex-row items-center`}>
                  <Text className="text-xs mr-1">{visibilityStyle.icon}</Text>
                  <Text className={`text-xs font-JakartaMedium capitalize ${visibilityStyle.text}`}>
                    {item.visibility}
                  </Text>
                </View>
                
                {/* Ministry/Team Badge */}
                {(item.ministryName || item.teamName) && (
                  <View className="px-2 py-1 rounded-full bg-gray-100">
                    <Text className="text-xs font-JakartaMedium text-gray-600">
                      {item.ministryName || item.teamName}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Member Count */}
            <View className="bg-gray-50 rounded-xl px-3 py-2 ml-3">
              <Text className="text-xs text-gray-500 text-center">Members</Text>
              <Text className="text-lg font-JakartaBold text-gray-900 text-center">
                {item.memberCount}
              </Text>
            </View>
          </View>

          {/* Description */}
          {item.description && (
            <Text className="text-sm text-gray-600 mb-3" numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {/* Action Button */}
          <TouchableOpacity
            onPress={() => item.isMember ? handleLeaveGroup(item) : handleJoinGroup(item)}
            className={`py-2 px-4 rounded-xl ${
              item.isMember ? 'bg-gray-100' : 'bg-primary-500'
            }`}
          >
            <Text className={`text-center font-JakartaSemiBold ${
              item.isMember ? 'text-gray-600' : 'text-white'
            }`}>
              {item.isMember ? 'Leave Group' : 'Join Group'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      {/* Search and Filters */}
      <View className="bg-white border-b border-gray-100 px-4 pb-3">
        {/* Search Bar */}
        <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center mb-3">
          <Image 
            source={icons.search} 
            className="w-5 h-5 mr-3" 
            style={{ tintColor: '#9CA3AF' }} 
          />
          <TextInput
            placeholder="Search groups..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-base font-Jakarta text-gray-900"
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {/* Filter Tabs */}
        <View className="flex-row gap-2">
          {(['all', 'joined', 'public'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              className={`flex-1 py-2 rounded-xl ${
                activeFilter === filter ? 'bg-primary-500' : 'bg-gray-100'
              }`}
            >
              <Text className={`text-center font-JakartaSemiBold capitalize ${
                activeFilter === filter ? 'text-white' : 'text-gray-600'
              }`}>
                {filter === 'all' ? 'All Groups' : filter === 'joined' ? 'My Groups' : 'Public'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Groups List */}
      <FlatList
        data={filteredGroups}
        renderItem={renderGroup}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadGroups(true)}
            colors={['#A89BB5']}
          />
        }
        contentContainerStyle={{ 
          paddingTop: 12,
          paddingBottom: 100
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View className="flex-1 justify-center items-center px-8 py-20">
            <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
              No Groups Found
            </Text>
            <Text className="text-gray-500 text-center">
              {searchQuery 
                ? `No groups match "${searchQuery}"`
                : activeFilter === 'joined'
                  ? "You haven't joined any groups yet"
                  : 'No groups available'}
            </Text>
          </View>
        )}
      />

      {/* Create Group FAB */}
      {canCreateGroup && (
        <TouchableOpacity
          onPress={() => router.push('/(root)/(tabs)/groups/create')}
          className="absolute bottom-24 right-4 w-14 h-14 bg-primary-500 rounded-full items-center justify-center shadow-lg"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Text className="text-white text-3xl font-light mb-1">+</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}