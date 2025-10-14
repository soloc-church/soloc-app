// app/(root)/messages.tsx
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  SafeAreaView,
  Image
} from 'react-native';
import { 
  ChannelList,
  ChannelPreviewMessenger,
  Channel as StreamChannel,
  MessageList,
  MessageInput,
  ChannelAvatar,
  Thread,
  OverlayProvider,
  Chat
} from 'stream-chat-expo';
import { Channel, ChannelSort, ChannelFilters, StreamChat } from 'stream-chat';
import { useStreamClient } from '@/providers/StreamProvider';
import { router, Stack } from 'expo-router';
import { icons } from '@/constants';

type ScreenState = 'list' | 'channel';

export default function MessagesScreen() {
  const { client, isConnected, isConnecting } = useStreamClient();
  const [screenState, setScreenState] = useState<ScreenState>('list');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [thread, setThread] = useState(null);

  // Channel list filters - show both DMs and group channels
  const filters: ChannelFilters = {
    members: { $in: [client?.userID || ''] },
    type: { $in: ['messaging', 'team'] }, // messaging for DMs, team for groups
  };

  const sort: ChannelSort = [{ last_message_at: -1 }];

  const CustomChannelPreview = (props: any) => {
    const { channel } = props;
    const isGroup = channel.type === 'team';
    const isUnread = channel.countUnread() > 0;
    
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedChannel(channel);
          setScreenState('channel');
        }}
        className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100"
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View className="mr-3">
          <ChannelAvatar channel={channel} />
          {isUnread && (
            <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
              <Text className="text-white text-xs font-bold">
                {channel.countUnread() > 99 ? '99+' : channel.countUnread()}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                {isGroup ? channel.data?.name : props.displayName}
              </Text>
              {isGroup && (
                <View className="px-2 py-0.5 bg-blue-100 rounded">
                  <Text className="text-xs text-blue-600">Group</Text>
                </View>
              )}
            </View>
            {props.latestMessagePreview?.messageObject?.created_at && (
              <Text className="text-xs text-gray-400">
                {props.formatLatestMessageDate}
              </Text>
            )}
          </View>
          
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {props.latestMessagePreview?.text || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const CustomListHeader = () => (
    <View className="bg-white border-b border-gray-200">
      <View className="flex-row items-center justify-between px-4 py-3">
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
          onPress={() => router.push('/(root)/profile/directory')}
          className="p-2"
        >
          <Image 
            source={icons.person} 
            className="w-6 h-6" 
            style={{ tintColor: '#4B5563' }}
          />
        </TouchableOpacity>
      </View>
      <View className="px-4 pb-3">
        <Text className="text-sm text-gray-500">
          Tap the person icon to start a new chat
        </Text>
      </View>
    </View>
  );

  const CustomChannelHeader = () => {
    if (!selectedChannel) return null;
    
    const isGroup = selectedChannel.type === 'team';
    const memberCount = Object.keys(selectedChannel.state.members).length;
    
    return (
      <SafeAreaView className="bg-white border-b border-gray-200">
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity 
            onPress={() => {
              setScreenState('list');
              setSelectedChannel(null);
            }}
            className="mr-3"
          >
            <Image 
              source={icons.backArrow} 
              className="w-6 h-6" 
              style={{ tintColor: '#4B5563' }}
            />
          </TouchableOpacity>
          
          <View className="flex-1 flex-row items-center">
            <ChannelAvatar channel={selectedChannel} />
            <View className="ml-3 flex-1">
              <Text className="text-lg font-JakartaBold text-gray-900" numberOfLines={1}>
                {isGroup 
                  ? selectedChannel.data?.name 
                  : Object.values(selectedChannel.state.members)
                      .find(m => m.user?.id !== client.userID)?.user?.name || 'User'}
              </Text>
              {isGroup && (
                <Text className="text-sm text-gray-500">
                  {memberCount} members
                </Text>
              )}
            </View>
          </View>

          {isGroup && (
            <TouchableOpacity
              onPress={() => {
                // Navigate to group details
                router.push({
                  pathname: '/(root)/(tabs)/groups/details',
                  params: { 
                    groupId: selectedChannel.id,
                    groupName: selectedChannel.data?.name 
                  }
                });
              }}
              className="p-2"
            >
              <Image 
                source={icons.info} 
                className="w-6 h-6" 
                style={{ tintColor: '#4B5563' }}
              />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  };

  if (!isConnected || isConnecting) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
          <Text className="text-gray-500 mt-3">
            {isConnecting ? 'Connecting to chat...' : 'Waiting for connection...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'channel' && selectedChannel) {
    return (
      <View className="flex-1 bg-white">
        <CustomChannelHeader />
        <StreamChannel channel={selectedChannel}>
          {thread ? (
            <Thread />
          ) : (
            <>
              <MessageList 
                onThreadSelect={setThread}
                additionalFlatListProps={{
                  keyboardDismissMode: 'on-drag',
                }}
              />
              <MessageInput />
            </>
          )}
        </StreamChannel>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <CustomListHeader />
      <ChannelList
        filters={filters}
        sort={sort}
        Preview={CustomChannelPreview}
        options={{
          watch: true,
          state: true,
        }}
        onSelect={(channel) => {
          setSelectedChannel(channel);
          setScreenState('channel');
        }}
        numberOfSkeletons={5}
        EmptyStateIndicator={() => (
          <View className="flex-1 justify-center items-center px-8">
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
            <Text className="text-gray-500 text-center mb-6">
              Join a group or start a conversation with someone from the directory
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => router.push('/(root)/(tabs)/groups')}
                className="bg-primary-500 px-6 py-3 rounded-xl"
              >
                <Text className="text-white font-JakartaSemiBold">Browse Groups</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(root)/profile/directory')}
                className="bg-gray-200 px-6 py-3 rounded-xl"
              >
                <Text className="text-gray-700 font-JakartaSemiBold">Find People</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}