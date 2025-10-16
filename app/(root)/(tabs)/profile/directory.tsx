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
import { createStreamApi, type StreamApi } from '@/lib/stream/api';
import { openDMChannel } from '@/lib/stream/helpers';
import { supabase } from '@/lib/supabase';
import { ProfileService } from '@/lib/services/profileService';
import { Database } from '@/types/database.types';

type DirectoryProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'phone' | 'address' | 'birthday' | 'profile_image_url' | 'global_role' | 'is_active' | 'joined_date'
>;
type GlobalRole = Database['public']['Enums']['global_role'];

export default function DirectoryScreen() {
  const { client, isConnected } = useStreamClient();
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<GlobalRole | null>(null);
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const apiBase = process.env.EXPO_PUBLIC_API_URL;

  const streamApi = React.useMemo<StreamApi | null>(() => {
    if (!apiBase) {
      console.warn('EXPO_PUBLIC_API_URL is not set; cannot configure Stream API client.');
      return null;
    }

    return createStreamApi({
      apiBase,
      getAuthHeader: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          throw new Error('Not authenticated');
        }
        return `Bearer ${token}`;
      },
    });
  }, [apiBase]);

  // Load profiles from Supabase
  React.useEffect(() => {
    const initializeDirectory = async () => {
      try {
        const role = await ProfileService.getCurrentUserRole();
        setUserRole(role);

        if (role === 'guest') {
          setProfiles([]);
          setLoading(false);
          return;
        }

        await loadProfiles();
      } catch (err) {
        console.error('Error determining directory access:', err);
        setError('Unable to load the directory right now.');
        setProfiles([]);
        setLoading(false);
      }
    };

    initializeDirectory();
  }, []);

  const loadProfiles = async () => {
    try {
      setError(null);
      setLoading(true);

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, address, birthday, profile_image_url, global_role, is_active, joined_date')
        .eq('is_active', true)
        .order('full_name');

      if (profileError) throw profileError;

      const directoryProfiles: DirectoryProfile[] = data || [];

      // Filter out the current user
      const { data: { user } } = await supabase.auth.getUser();
      const filtered = directoryProfiles.filter(p => p.id !== user?.id);

      setProfiles(filtered);
    } catch (error) {
      console.error('Error loading profiles:', error);
      setError('Unable to load the directory right now.');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async (profile: DirectoryProfile) => {
    if (!isConnected) {
      alert('Please wait for chat to connect');
      return;
    }
    if (!streamApi) {
      console.error('Stream API client is not configured.');
      alert('Chat is not available right now. Please try again later.');
      return;
    }

    try {
      setStartingChat(profile.id);

      // Start the DM chat
      const channel = await openDMChannel(client, streamApi, profile.id);

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

  const handleOpenProfile = (profileId: string) => {
    router.push({
      pathname: '/(root)/(tabs)/profile/directory/[id]',
      params: { id: profileId },
    });
  };

  const renderProfile = ({ item }: { item: DirectoryProfile }) => {
    const isStartingChat = startingChat === item.id;
    const displayRole = (item.global_role ?? 'member') as GlobalRole;
    const roleLabel = `${displayRole.charAt(0).toUpperCase()}${displayRole.slice(1)}`;
    const displayName = item.full_name?.trim() ? item.full_name : 'Unnamed Member';

    return (
      <TouchableOpacity
        onPress={() => handleOpenProfile(item.id)}
        className="bg-white px-4 py-3 flex-row items-center border-b border-gray-50"
        activeOpacity={0.8}
      >
        {/* Avatar */}
        <View className="w-12 h-12 bg-primary-100 rounded-full items-center justify-center mr-3">
          {item.profile_image_url ? (
            <Image
              source={{ uri: item.profile_image_url }}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <Text className="text-lg font-JakartaBold text-primary-600">
              {displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        {/* Profile Info */}
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-gray-900">
            {displayName}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-sm text-gray-500 capitalize">
              {roleLabel}
            </Text>
            {item.phone && (
              <>
                <Text className="text-gray-400">•</Text>
                <Text className="text-sm text-gray-500">
                  {item.phone}
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

  const showGuestMessage = userRole === 'guest';

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

      {error ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-center text-base text-gray-600">
            {error}
          </Text>
        </View>
      ) : showGuestMessage ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
            Members Only
          </Text>
          <Text className="text-gray-500 text-center">
            The church directory is available to members. Please contact a leader if you need access.
          </Text>
        </View>
      ) : (
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
      )}
    </SafeAreaView>
  );
}
