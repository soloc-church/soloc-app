// app/(root)/messages.tsx
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  SafeAreaView,
  Image,
  TextInput,
} from 'react-native';
import { 
  ChannelList,
  ChannelPreviewMessenger,
  ChannelAvatar,
} from 'stream-chat-expo';
import { Channel, ChannelSort, ChannelFilters } from 'stream-chat';
import { useStreamClient } from '@/providers/StreamProvider';
import { router } from 'expo-router';
import { icons } from '@/constants';

export default function MessagesScreen() {
  const { client, isConnected } = useStreamClient();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Channel list filters - show both DMs and group channels
  const filters: ChannelFilters = {
    members: { $in: [client?.userID || ''] },
    type: { $in: ['messaging', 'team'] },
  };

  const sort: ChannelSort = [{ last_message_at: -1 }];

  const CustomListHeader = () => (
    <SafeAreaView className="bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <TouchableOpacity 
          onPress={() => router.back()}
          className="mr-3"
        >
          <Image 
            source={icons.backArrow} 
            className="w-6 h-6" 
            style={{ tintColor: '#4B5563' }}
          />
        </TouchableOpacity>
        <Text className="flex-1 text-xl font-JakartaBold text-gray-900">Messages</Text>
        <TouchableOpacity
          onPress={() => router.push('/(root)/(tabs)/profile/directory')}
          className="p-2"
        >
          <Image 
            source={icons.person} 
            className="w-6 h-6" 
            style={{ tintColor: '#4B5563' }}
          />
        </TouchableOpacity>
      </View>
      
      {/* Search Bar */}
      <View className="px-4 py-3">
        <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center">
          <Image 
            source={icons.search} 
            className="w-5 h-5 mr-3" 
            style={{ tintColor: '#9CA3AF' }} 
          />
          <TextInput
            placeholder="Search conversations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-base font-Jakarta text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>
    </SafeAreaView>
  );

  const CustomChannelPreview = (props: any) => {
    const { channel } = props;
    const isGroup = channel.type === 'team';
    const isUnread = channel.countUnread() > 0;
    const lastMessage = props.latestMessage;
    
    return (
      <TouchableOpacity
        onPress={() => {
          router.push({
            pathname: '/(root)/chat/channel',
            params: {
              channelId: channel.id,
              channelType: channel.type,
              channelName: isGroup ? channel.data?.name : props.displayName
            }
          });
        }}
        className={`flex-row items-center px-4 py-3 ${
          isUnread ? 'bg-primary-50' : 'bg-white'
        } border-b border-gray-50`}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View className="mr-3">
          <ChannelAvatar channel={channel} />
          {isUnread && (
            <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
              <Text className="text-white text-xs font-JakartaBold">
                {channel.countUnread() > 99 ? '99+' : channel.countUnread()}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-1">
            <View className="flex-row items-center gap-2 flex-1">
              <Text 
                className={`text-base ${
                  isUnread ? 'font-JakartaBold' : 'font-JakartaSemiBold'
                } text-gray-900`} 
                numberOfLines={1}
              >
                {isGroup ? channel.data?.name : props.displayName}
              </Text>
              {isGroup && (
                <View className="px-2 py-0.5 bg-blue-100 rounded">
                  <Text className="text-xs text-blue-600">Group</Text>
                </View>
              )}
            </View>
            {lastMessage?.created_at && (
              <Text className="text-xs text-gray-400">
                {props.formatLatestMessageDate}
              </Text>
            )}
          </View>
          
          <Text 
            className={`text-sm ${
              isUnread ? 'text-gray-700' : 'text-gray-500'
            }`} 
            numberOfLines={1}
          >
            {lastMessage?.text || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const CustomEmptyState = () => (
    <View className="flex-1 justify-center items-center px-8 py-20">
      <View className="w-24 h-24 bg-gray-100 rounded-full items-center justify-center mb-4">
        <Image
          source={icons.chat}
          className="w-12 h-12"
          style={{ tintColor: '#9CA3AF' }}
        />
      </View>
      <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
        No Conversations Yet
      </Text>
      <Text className="text-gray-500 text-center mb-6">
        Start a conversation from the directory or join a group to begin messaging
      </Text>
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => router.push('/(root)/(tabs)/groups')}
          className="bg-primary-500 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-JakartaSemiBold">Browse Groups</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(root)/(tabs)/profile/directory')}
          className="bg-gray-200 px-6 py-3 rounded-xl"
        >
          <Text className="text-gray-700 font-JakartaSemiBold">Find People</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!isConnected) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <CustomListHeader />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
          <Text className="text-gray-500 mt-3">Connecting to chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ChannelList
        filters={filters}
        sort={sort}
        Preview={CustomChannelPreview}
        ListHeaderComponent={CustomListHeader}
        EmptyStateIndicator={CustomEmptyState}
        options={{
          watch: true,
          state: true,
        }}
        numberOfSkeletons={5}
      />
    </View>
  );
}