// app/(root)/(tabs)/profile/directory/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { useStreamClient } from '@/providers/StreamProvider';
import { createStreamApi } from '@/lib/stream/api';
import { openDMChannel } from '@/lib/stream/helpers';

type DirectoryProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'phone' | 'address' | 'birthday' | 'profile_image_url' | 'global_role' | 'joined_date' | 'is_active'
>;

export default function DirectoryProfileDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const profileId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const { client, isConnected } = useStreamClient();
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
    fetchProfile();
  }, [profileId]);

  const fetchProfile = async () => {
    if (!profileId) {
      setLoading(false);
      return;
    }

    try {
      const [authRes, profileRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', profileId)
          .single(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setCurrentUserId(authRes.data.user?.id ?? null);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!profileId || !profile || !isConnected || !streamApi) return;
    
    if (currentUserId === profileId) return;

    setStartingChat(true);
    try {
      //DEBUG
      console.log('[DEBUG][directory/profile] handleStartChat start', {
        profileId,
        currentUserId,
        streamApiBase: process.env.EXPO_PUBLIC_API_URL,
      });
      const channel = await openDMChannel(client, streamApi, profileId);
      //DEBUG
      console.log('[DEBUG][directory/profile] handleStartChat channel', {
        channelId: channel.id,
        channelCid: channel.cid,
        idLength: channel.id?.length,
      });
      
      router.push({
        pathname: '/(root)/chat/channel',
        params: {
          channelId: channel.id!,
          channelType: 'messaging',
          channelName: profile.full_name || 'Direct Message'
        }
      });
    } catch (error) {
      console.error('Error starting chat:', error);
      alert('Failed to start chat. Please try again.');
    } finally {
      setStartingChat(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="px-4 py-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Image source={icons.backArrow} className="w-6 h-6" style={{ tintColor: '#4B5563' }} />
          </TouchableOpacity>
        </View>
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = profile.full_name?.trim() || 'Unnamed Member';
  const canMessage = profileId && currentUserId !== profileId;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Image
            source={icons.backArrow}
            className="w-6 h-6"
            style={{ tintColor: '#4B5563' }}
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View className="bg-white">
          <View className="items-center py-8">
            <View className="w-32 h-32 rounded-full bg-gray-100 items-center justify-center mb-4">
              {profile.profile_image_url ? (
                <Image
                  source={{ uri: profile.profile_image_url }}
                  className="w-32 h-32 rounded-full"
                />
              ) : (
                <Text className="text-4xl font-JakartaBold text-gray-600">
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            
            <Text className="text-2xl font-JakartaBold text-gray-900 text-center">
              {displayName}
            </Text>
            
            {profile.global_role && (
              <View className="mt-2 px-4 py-1 bg-primary-100 rounded-full">
                <Text className="text-primary-600 capitalize font-JakartaSemiBold">
                  {profile.global_role}
                </Text>
              </View>
            )}
          </View>

          {/* Message Button */}
          {canMessage && (
            <View className="px-6 pb-6">
              <TouchableOpacity
                onPress={handleStartChat}
                disabled={startingChat || !isConnected}
                className={`${
                  startingChat || !isConnected ? 'bg-gray-300' : 'bg-primary-500'
                } py-3 rounded-xl flex-row items-center justify-center`}
              >
                {startingChat ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Image
                      source={icons.chat}
                      className="w-5 h-5 mr-2"
                      style={{ tintColor: 'white' }}
                    />
                    <Text className="text-white font-JakartaSemiBold text-base">
                      Send Message
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Contact Information */}
        <View className="mt-3 bg-white px-6 py-6">
          <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-4">
            Contact Information
          </Text>
          
          {profile.phone ? (
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">Phone</Text>
              <Text className="text-base text-gray-900 font-JakartaMedium">
                {profile.phone}
              </Text>
            </View>
          ) : null}
          
          {profile.email ? (
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">Email</Text>
              <Text className="text-base text-gray-900 font-JakartaMedium">
                {profile.email}
              </Text>
            </View>
          ) : null}
          
          {profile.address ? (
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">Address</Text>
              <Text className="text-base text-gray-900 font-JakartaMedium">
                {profile.address}
              </Text>
            </View>
          ) : null}

          {!profile.phone && !profile.email && !profile.address && (
            <Text className="text-gray-400 italic">No contact information available</Text>
          )}
        </View>

        {/* Additional Information */}
        <View className="mt-3 mb-6 bg-white px-6 py-6">
          <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-4">
            Additional Information
          </Text>
          
          {profile.birthday ? (
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">Birthday</Text>
              <Text className="text-base text-gray-900 font-JakartaMedium">
                {formatDate(profile.birthday)}
              </Text>
            </View>
          ) : null}
          
          {profile.joined_date ? (
            <View>
              <Text className="text-xs text-gray-500 mb-1">Member Since</Text>
              <Text className="text-base text-gray-900 font-JakartaMedium">
                {formatDate(profile.joined_date)}
              </Text>
            </View>
          ) : null}

          {!profile.birthday && !profile.joined_date && (
            <Text className="text-gray-400 italic">No additional information available</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
