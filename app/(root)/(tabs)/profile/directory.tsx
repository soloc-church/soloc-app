// app/(root)/(tabs)/profile/directory.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { useStreamClient } from '@/providers/StreamProvider';
import { startDMChat } from '@/lib/chat/helpers';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  global_role: string;
  ministry_name?: string;
  team_name?: string;
}

export default function DirectoryScreen() {
  const { client, isConnected } = useStreamClient();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState<string | null>(null);

  // Load profiles from Supabase
  React.useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          avatar_url,
          global_role,
          ministries!ministry_members(ministries:ministry_id(name)),
          teams!team_members(teams:team_id(name))
        `)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;

      // Format the profiles
      const formattedProfiles: Profile[] = (data || []).map(profile => ({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        global_role: profile.global_role,
        ministry_name: profile.ministries?.[0]?.ministries?.name,
        team_name: profile.teams?.[0]?.teams?.name,
      }));

      // Filter out the current user
      const { data: { user } } = await supabase.auth.getUser();
      const filtered = formattedProfiles.filter(p => p.id !== user?.id);

      setProfiles(filtered);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async (profile: Profile) => {
    if (!isConnected) {
      alert('Please wait for chat to connect');
      return;
    }

    try {
      setStartingChat(profile.id);

      // Start the DM chat
      const { channel } = await startDMChat(
        client,
        profile.id,
        profile.full_name
      );

      // Navigate to the messages screen with the channel
      // The messages screen will handle showing this specific channel
      router.push({
        pathname: '/(root)/messages',
        params: {
          channelCid: channel.cid,
          channelType: 'dm',
        }
      });
    } catch (error) {
      console.error('Error starting chat:', error);
      alert('Failed to start chat. Please try again.');
    } finally {
      setStartingChat(null);
    }
  };

  const renderProfile = ({ item }: { item: Profile }) => {
    const isStartingChat = startingChat === item.id;

    return (
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-50">
        {/* Avatar */}
        <View className="w-12 h-12 bg-primary-100 rounded-full items-center justify-center mr-3">
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <Text className="text-lg font-JakartaBold text-primary-600">
              {item.full_name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        {/* Profile Info */}
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-gray-900">
            {item.full_name}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-sm text-gray-500 capitalize">
              {item.global_role}
            </Text>
            {item.ministry_name && (
              <>
                <Text className="text-gray-400">•</Text>
                <Text className="text-sm text-gray-500">
                  {item.ministry_name}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Chat Button */}
        <TouchableOpacity
          onPress={() => handleStartChat(item)}
          disabled={isStartingChat}
          className="bg-primary-500 px-4 py-2 rounded-xl flex-row items-center"
          activeOpacity={0.8}
        >
          {isStartingChat ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Image
                source={icons.chat}
                className="w-4 h-4 mr-2"
                style={{ tintColor: 'white' }}
              />
              <Text className="text-white font-JakartaSemiBold">Chat</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-100 px-4 py-3">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Image
              source={icons.backArrow}
              className="w-6 h-6"
              style={{ tintColor: '#4B5563' }}
            />
          </TouchableOpacity>
          <Text className="text-xl font-JakartaBold text-gray-900">
            Church Directory
          </Text>
        </View>
      </View>

      {/* Profiles List */}
      <FlatList
        data={profiles}
        renderItem={renderProfile}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View className="flex-1 justify-center items-center px-8 py-20">
            <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
              No Members Found
            </Text>
            <Text className="text-gray-500 text-center">
              The directory is currently empty
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}