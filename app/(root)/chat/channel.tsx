// app/(root)/chat/channel.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import {
  Channel as StreamChannel,
  MessageList,
  MessageInput,
  ChannelAvatar,
  Thread,
  useChannelContext,
  useMessagesContext,
} from 'stream-chat-expo';
import { Channel } from 'stream-chat';
import { useStreamClient } from '@/providers/StreamProvider';
import { router, useLocalSearchParams } from 'expo-router';
import { icons } from '@/constants';

export default function ChatChannelScreen() {
  const { channelId, channelType, channelName } = useLocalSearchParams<{
    channelId: string;
    channelType: string;
    channelName: string;
  }>();
  
  const { client, isConnected } = useStreamClient();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !channelId || !client.userID) return;

    const setupChannel = async () => {
      try {
        const channelInstance = client.channel(
          channelType as any || 'messaging',
          channelId
        );
        
        await channelInstance.watch();
        setChannel(channelInstance);
      } catch (error) {
        console.error('Error setting up channel:', error);
      } finally {
        setLoading(false);
      }
    };

    setupChannel();

    return () => {
      channel?.stopWatching();
    };
  }, [client, channelId, channelType, isConnected]);

  const CustomChannelHeader = () => {
    const isGroup = channelType === 'team';
    const memberCount = channel ? Object.keys(channel.state.members).length : 0;
    const otherUser = !isGroup && channel
      ? Object.values(channel.state.members).find(m => m.user?.id !== client.userID)
      : null;

    return (
      <SafeAreaView className="bg-white border-b border-gray-200">
        <View className="flex-row items-center px-4 py-3">
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
          
          <View className="mr-3">
            {channel && <ChannelAvatar channel={channel} />}
          </View>
          
          <View className="flex-1">
            <Text className="text-lg font-JakartaBold text-gray-900" numberOfLines={1}>
              {isGroup 
                ? (channelName || channel?.data?.name || 'Group Chat')
                : (otherUser?.user?.name || 'Direct Message')}
            </Text>
            {isGroup && (
              <Text className="text-sm text-gray-500">
                {memberCount} members
              </Text>
            )}
            {!isGroup && otherUser?.user?.online && (
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                <Text className="text-sm text-green-600">Online</Text>
              </View>
            )}
          </View>

          {isGroup && (
            <TouchableOpacity
              onPress={() => {
                router.push({
                  pathname: '/(root)/(tabs)/groups/[id]',
                  params: { id: channelId }
                });
              }}
              className="p-2"
            >
              <Image 
                source={icons.info} 
                className="w-6 h-6" 
                style={{ tintColor: '#6B7280' }}
              />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  };

  if (loading || !channel) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <CustomChannelHeader />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
          <Text className="text-gray-500 mt-3">Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <CustomChannelHeader />
      <StreamChannel channel={channel}>
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