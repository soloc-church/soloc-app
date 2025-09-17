// components/messages/DiscoverTab.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';

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
}

interface DiscoverTabProps {
  searchQuery: string;
  canCreateGroup: boolean;
}

export default function DiscoverTab({ searchQuery, canCreateGroup }: DiscoverTabProps) {
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .rpc('get_discoverable_groups', { 
          p_search: searchQuery || null,
          p_limit: 50
        });

      if (error) throw error;

      const formattedGroups: GroupChat[] = (data || []).map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        memberCount: group.member_count,
        gatheringDays: group.gathering_days,
        ministryName: group.ministry_name,
        teamName: group.team_name,
        isMember: group.is_member,
        hasSubteams: group.has_subteams,
        streamChannelId: group.stream_channel_id,
      }));

      setGroups(formattedGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getVisibilityColor = (visibility: string) => {
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

  const handleGroupPress = (group: GroupChat) => {
    router.push({
      pathname: '/(root)/(tabs)/message/group-details',
      params: { 
        groupId: group.id,
        groupName: group.name
      }
    });
  };

  const handleCreateGroup = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.push('/(root)/(tabs)/message/create-group');
    });
  };

  const renderGroup = ({ item, index }: { item: GroupChat; index: number }) => {
    const visibilityStyle = getVisibilityColor(item.visibility);
    const delay = index * 50;

    return (
      <Animated.View
        style={{
          opacity: new Animated.Value(0),
          transform: [
            {
              translateY: new Animated.Value(20),
            },
          ],
        }}
        onLayout={(e) => {
        }}
      >
        <TouchableOpacity
          onPress={() => handleGroupPress(item)}
          activeOpacity={0.9}
          className="mx-4 mb-4"
        >
          <LinearGradient
            colors={['#FFFFFF', '#FAFAFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-4 border border-gray-100 shadow-sm"
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
                    <View className="px-2 py-1 rounded-full bg-gray-100 flex-row items-center">
                      <Image 
                        source={icons.home} 
                        className="w-3 h-3 mr-1" 
                        style={{ tintColor: '#6B7280' }}
                      />
                      <Text className="text-xs font-JakartaMedium text-gray-600">
                        {item.ministryName || item.teamName}
                      </Text>
                    </View>
                  )}

                  {/* Member Status */}
                  {item.isMember && (
                    <View className="px-2 py-1 rounded-full bg-primary-100">
                      <Text className="text-xs font-JakartaMedium text-primary-600">
                        Joined
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

            {/* Footer */}
            <View className="flex-row items-center justify-between">
              {/* Gathering Days */}
              {item.gatheringDays && item.gatheringDays.length > 0 && (
                <View className="flex-row items-center">
                  <Image 
                    source={icons.calendar} 
                    className="w-4 h-4 mr-1" 
                    style={{ tintColor: '#9CA3AF' }}
                  />
                  <Text className="text-xs text-gray-500">
                    {item.gatheringDays.join(', ')}
                  </Text>
                </View>
              )}

              {/* Features */}
              <View className="flex-row items-center gap-2">
                {item.hasSubteams && (
                  <View className="flex-row items-center">
                    <Text className="text-xs text-gray-400">Has subteams</Text>
                  </View>
                )}
                
                <Image
                  source={icons.arrowRight}
                  className="w-4 h-4"
                  style={{ tintColor: '#D1D5DB', transform: [{ rotate: '180deg' }] }}
                />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const EmptyState = () => (
    <View className="flex-1 justify-center items-center px-8 py-20">
      <View className="w-24 h-24 bg-gray-100 rounded-full items-center justify-center mb-4">
        <Image
          source={icons.search}
          className="w-12 h-12"
          style={{ tintColor: '#9CA3AF' }}
        />
      </View>
      <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
        {searchQuery ? 'No Groups Found' : 'No Groups Available'}
      </Text>
      <Text className="text-gray-500 text-center">
        {searchQuery 
          ? `No groups match "${searchQuery}"`
          : 'Check back later for new groups to join'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#A89BB5" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={groups}
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
            paddingBottom: canCreateGroup ? 100 : 20 
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button for Create Group */}
      {canCreateGroup && (
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
            position: 'absolute',
            bottom: 20,
            right: 20,
          }}
        >
          <TouchableOpacity
            onPress={handleCreateGroup}
            activeOpacity={0.9}
            className="w-14 h-14 bg-primary-500 rounded-full items-center justify-center shadow-lg"
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
        </Animated.View>
      )}
    </View>
  );
}