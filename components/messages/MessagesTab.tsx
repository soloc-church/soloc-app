// components/messages/MessagesTab.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { streamChatService } from '@/lib/services/streamChatService';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface MessageChannel {
  id: string;
  name: string;
  image?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
  isOnline?: boolean;
  otherUserId?: string;
}

interface MessagesTabProps {
  searchQuery: string;
}

export default function MessagesTab({ searchQuery }: MessagesTabProps) {
  const [channels, setChannels] = useState<MessageChannel[]>([]);
  const [groupChannels, setGroupChannels] = useState<MessageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      // Load DM channels from Stream
      const dmChannels = await streamChatService.getUserDMChannels();
      const groupChats = await streamChatService.getUserGroupChannels();

      // Format DM channels
      const formattedDMs = dmChannels.map(channel => {
        const otherMember = Object.values(channel.state.members).find(
          member => member.user?.id !== streamChatService.getCurrentUser()?.id
        );

        return {
          id: channel.id!,
          name: otherMember?.user?.name || 'Unknown User',
          image: otherMember?.user?.image,
          lastMessage: channel.state.messages[channel.state.messages.length - 1]?.text,
          lastMessageAt: channel.state.messages[channel.state.messages.length - 1]?.created_at,
          unreadCount: channel.countUnread(),
          isOnline: otherMember?.user?.online,
          otherUserId: otherMember?.user?.id,
        };
      });



      setChannels(formattedDMs);
    } catch (error) {
      console.error('Error loading channels:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredChannels = [...channels, ...groupChannels].filter(channel =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChannelPress = (channel: MessageChannel) => {
    if (channel.otherUserId) {
      // Direct message
      router.push({
        pathname: '/(root)/(tabs)/message/chat',
        params: { 
          type: 'dm',
          userId: channel.otherUserId,
          channelId: channel.id,
          name: channel.name 
        }
      });
    } else {
      // Group chat
      router.push({
        pathname: '/(root)/(tabs)/message/chat',
        params: { 
          type: 'group',
          channelId: channel.id,
          name: channel.name 
        }
      });
    }
  };

  const renderChannel = ({ item }: { item: MessageChannel }) => (
    <TouchableOpacity
      onPress={() => handleChannelPress(item)}
      className="bg-white px-4 py-3 flex-row items-center border-b border-gray-50"
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View className="relative mr-3">
        <View className="w-14 h-14 bg-primary-100 rounded-full items-center justify-center">
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <Text className="text-xl font-JakartaBold text-primary-600">
              {item.name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        
        {/* Online indicator */}
        {item.isOnline && (
          <View className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
        )}
        
        {/* Unread badge */}
        {item.unreadCount > 0 && (
          <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
            <Text className="text-white text-xs font-JakartaBold">
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-base font-JakartaSemiBold text-gray-900" numberOfLines={1}>
            {item.name}
          </Text>
          {item.lastMessageAt && (
            <Text className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: false })}
            </Text>
          )}
        </View>
        
        {item.lastMessage && (
          <Text className="text-sm text-gray-500" numberOfLines={2}>
            {item.lastMessage}
          </Text>
        )}
      </View>

      {/* Arrow */}
      <Image
        source={icons.arrowRight}
        className="w-5 h-5 ml-2"
        style={{ tintColor: '#D1D5DB', transform: [{ rotate: '180deg' }] }}
      />
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View className="flex-1 justify-center items-center px-8 py-20">
      <View className="w-24 h-24 bg-gray-100 rounded-full items-center justify-center mb-4">
        <Image
          source={icons.chat}
          className="w-12 h-12"
          style={{ tintColor: '#9CA3AF' }}
        />
      </View>
      <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
        No Messages Yet
      </Text>
      <Text className="text-gray-500 text-center">
        Start a conversation with someone or join a group to begin messaging
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/(root)/(tabs)/profile/directory')}
        className="mt-6 bg-primary-500 px-6 py-3 rounded-xl"
      >
        <Text className="text-white font-JakartaSemiBold">Find People</Text>
      </TouchableOpacity>
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
      {filteredChannels.length === 0 ? (
        searchQuery ? (
          <View className="flex-1 justify-center items-center px-8">
            <Text className="text-gray-500 text-center">
              No messages found for "{searchQuery}"
            </Text>
          </View>
        ) : (
          <EmptyState />
        )
      ) : (
        <FlatList
          data={filteredChannels}
          renderItem={renderChannel}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadChannels(true)}
              colors={['#A89BB5']}
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}