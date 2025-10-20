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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { useAuthz } from '@/hooks/useAuthz';
import { can } from '@/lib/rbac/permissions';
import { LinearGradient } from 'expo-linear-gradient';
import { useStreamClient } from '@/providers/StreamProvider';
import { createStreamApi } from '@/lib/stream/api';
import { joinGroup } from '@/lib/stream/helpers';

interface GroupChat {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'members' | 'private';
  memberCount: number;
  ministryName: string | null;
  teamName: string | null;
  isMember: boolean;
  streamChannelId: string | null;
  createdBy: string | null;
}

export default function GroupsScreen() {
  const { authz } = useAuthz();
  const { client, isConnected } = useStreamClient();
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'joined' | 'public'>('all');
  const canCreateGroup = can.canCreateGroup(authz);

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
    loadGroups();
  }, [activeFilter]);

  const loadGroups = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      //DEBUG
      console.log('[DEBUG][groups/index] loadGroups start', {
        isRefreshing,
        activeFilter,
      });
      let query = supabase
        .from('group_chats')
        .select(`
          id,
          name,
          description,
          visibility,
          stream_channel_id,
          created_by,
          ministries!group_chats_ministry_id_fkey(name),
          teams!group_chats_team_id_fkey(name),
          group_memberships!group_memberships_group_chat_id_fkey(user_id)
        `)
        //.is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (activeFilter === 'public') {
        query = query.eq('visibility', 'public');
      }

      const { data: groups, error } = await query;
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      //DEBUG
      console.log('[DEBUG][groups/index] supabase query result', {
        fetchedGroups: groups?.length ?? 0,
        userId: user?.id,
      });
      
      const formattedGroups: GroupChat[] = (groups || []).map(group => {
        const members = group.group_memberships || [];
        //DEBUG
        console.log('[DEBUG][groups/index] group row', {
          groupId: group.id,
          memberCount: members.length,
          streamChannelId: group.stream_channel_id,
        });
        const isMember = members.some((m: any) => m.user_id === user?.id);
        
        if (activeFilter === 'joined' && !isMember) {
          return null;
        }

        return {
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          memberCount: members.length,
          ministryName: group.ministries?.name,
          teamName: group.name,
          isMember,
          streamChannelId: group.stream_channel_id,
          createdBy: group.created_by,
        };
      }).filter(Boolean) as GroupChat[];

      setGroups(formattedGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      //DEBUG
      console.log('[DEBUG][groups/index] loadGroups end');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleJoinGroup = async (group: GroupChat) => {
    if (!isConnected || !streamApi) {
      alert('Please wait for chat to connect');
      return;
    }

    try {
      //DEBUG
      console.log('[DEBUG][groups/index] handleJoinGroup pre', {
        groupId: group.id,
        streamChannelIdOnRecord: group.streamChannelId,
        isConnected,
        hasApi: !!streamApi,
      });
      await joinGroup(client, streamApi, group.id);
      //DEBUG
      console.log('[DEBUG][groups/index] handleJoinGroup post', {
        groupId: group.id,
      });
      await loadGroups();
      alert(`Successfully joined ${group.name}!`);
    } catch (error) {
      console.error('Error joining group:', error);
      alert('Failed to join group');
    }
  };

  const handleGroupPress = (group: GroupChat) => {
    if (group.isMember) {
      // Navigate directly to chat
      router.push({
        pathname: '/(root)/chat/channel',
        params: {
          channelId: group.id,
          channelType: 'team',
          channelName: group.name
        }
      });
    } else {
      // Show group details for non-members
      router.push({
        pathname: '/(root)/(tabs)/groups/[id]',
        params: { id: group.id }
      });
    }
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderGroup = ({ item }: { item: GroupChat }) => {
    const visibilityColors = {
      public: { bg: '#10B98120', text: '#10B981', label: 'Public' },
      members: { bg: '#3B82F620', text: '#3B82F6', label: 'Members' },
      private: { bg: '#8B5CF620', text: '#8B5CF6', label: 'Private' }
    };

    const visibility = visibilityColors[item.visibility];

    return (
      <TouchableOpacity
        onPress={() => handleGroupPress(item)}
        className="mx-4 mb-3"
        activeOpacity={0.9}
      >
        <View className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {/* Gradient Header */}
          <LinearGradient
            colors={['#A89BB5', '#8B7F97']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="px-4 pt-4 pb-3"
          >
            <View className="flex-row justify-between items-start">
              <View className="flex-1 mr-3">
                <Text className="text-white text-lg font-JakartaBold" numberOfLines={1}>
                  {item.name}
                </Text>
                {item.ministryName || item.teamName ? (
                  <Text className="text-white/80 text-sm mt-1">
                    {item.ministryName || item.teamName}
                  </Text>
                ) : null}
              </View>
              <View className="bg-white/20 px-3 py-1.5 rounded-full">
                <Text className="text-white text-sm font-JakartaSemiBold">
                  {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Content */}
          <View className="px-4 py-3">
            {item.description ? (
              <Text className="text-gray-600 text-sm mb-3" numberOfLines={2}>
                {item.description}
              </Text>
            ) : (
              <Text className="text-gray-400 text-sm italic mb-3">
                No description available
              </Text>
            )}

            {/* Footer */}
            <View className="flex-row items-center justify-between">
              <View 
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: visibility.bg }}
              >
                <Text 
                  className="text-xs font-JakartaSemiBold"
                  style={{ color: visibility.text }}
                >
                  {visibility.label}
                </Text>
              </View>

              {item.isMember ? (
                <View className="flex-row items-center">
                  <View className="bg-green-100 px-3 py-1 rounded-full">
                    <Text className="text-green-600 text-xs font-JakartaSemiBold">
                      Joined
                    </Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleJoinGroup(item);
                  }}
                  className="bg-primary-500 px-4 py-1.5 rounded-full"
                >
                  <Text className="text-white text-xs font-JakartaSemiBold">
                    Join
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      {/* Search Bar */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center">
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
          />
        </View>
      </View>

      {/* Filter Tabs */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
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
                {filter === 'all' ? 'All' : filter === 'joined' ? 'My Groups' : 'Public'}
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
            <Image 
              source={icons.chat} 
              className="w-20 h-20 mb-4" 
              style={{ tintColor: '#D1D5DB' }}
            />
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

      {/* Create Group FAB - Only for elders+ */}
      {canCreateGroup && (
        <TouchableOpacity
          onPress={() => router.push('/(root)/(tabs)/groups/create')}
          className="absolute bottom-24 right-4 w-14 h-14 bg-primary-500 rounded-full items-center justify-center"
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
