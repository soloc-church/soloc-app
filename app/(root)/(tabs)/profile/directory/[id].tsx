import React from 'react';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
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
import { createStreamApi, type StreamApi } from '@/lib/stream/api';
import { openDMChannel } from '@/lib/stream/helpers';

type DirectoryProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'phone' | 'address' | 'birthday' | 'profile_image_url' | 'global_role' | 'joined_date' | 'is_active'
>;
type GlobalRole = Database['public']['Enums']['global_role'];

const InfoCard = ({ label, value }: { label: string; value: string }) => (
  <View className="bg-white rounded-xl px-4 py-3 border border-gray-100 mb-3">
    <Text className="text-xs font-JakartaSemiBold uppercase text-gray-400">
      {label}
    </Text>
    <Text className="text-base font-JakartaSemiBold text-gray-900 mt-1">
      {value}
    </Text>
  </View>
);

export default function DirectoryProfileDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const profileId = React.useMemo(() => {
    const value = params.id;
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }, [params.id]);

  const { client, isConnected } = useStreamClient();
  const [profile, setProfile] = React.useState<DirectoryProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [startingChat, setStartingChat] = React.useState(false);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      if (!profileId) {
        setError('Profile not found.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const [{ data: authData, error: authError }, { data: profileData, error: profileError }] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('profiles')
            .select('id, full_name, email, phone, address, birthday, profile_image_url, global_role, joined_date, is_active')
            .eq('id', profileId)
            .maybeSingle(),
        ]);

        if (authError) throw authError;
        if (profileError) throw profileError;
        if (!profileData || profileData.is_active === false) {
          throw new Error('Profile not found');
        }

        if (!isMounted) return;

        setCurrentUserId(authData.user?.id ?? null);
        setProfile(profileData);
      } catch (err) {
        console.error('Error loading profile:', err);
        if (isMounted) {
          setError('Unable to load this profile right now.');
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  const formatDate = React.useCallback((value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const handleStartChat = async () => {
    if (!profileId || !profile) {
      return;
    }

    if (currentUserId && currentUserId === profileId) {
      return;
    }

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
      setStartingChat(true);

      const channel = await openDMChannel(client, streamApi, profileId);

      router.push({
        pathname: '/(root)/messages',
        params: {
          channelCid: channel.cid,
          channelType: 'dm',
        }
      });
    } catch (err) {
      console.error('Error starting chat:', err);
      alert('Failed to start chat. Please try again.');
    } finally {
      setStartingChat(false);
    }
  };

  const displayName = profile?.full_name?.trim()
    ? profile.full_name
    : 'Unnamed Member';
  const displayRole = (profile?.global_role ?? 'member') as GlobalRole;
  const roleLabel = `${displayRole.charAt(0).toUpperCase()}${displayRole.slice(1)}`;
  const initials = displayName.charAt(0).toUpperCase();
  const canMessage = !!profile && !!profileId && currentUserId !== profileId;
  const formattedBirthday = formatDate(profile?.birthday);
  const formattedJoinedDate = formatDate(profile?.joined_date);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
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
            Member Profile
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
        </View>
      ) : error ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-center text-base text-gray-600">
            {error}
          </Text>
        </View>
      ) : !profile ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-center text-base text-gray-600">
            Profile not available.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center mt-8">
              <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-4 overflow-hidden">
                {profile.profile_image_url ? (
                  <Image
                    source={{ uri: profile.profile_image_url }}
                    className="w-24 h-24 rounded-full"
                  />
                ) : (
                  <Text className="text-3xl font-JakartaBold text-primary-600">
                    {initials}
                  </Text>
                )}
              </View>
              <Text className="text-2xl font-JakartaBold text-gray-900 text-center">
                {displayName}
              </Text>
              <Text className="text-base text-gray-500 mt-2 capitalize">
                {roleLabel}
              </Text>
            </View>

            <View className="mt-10">
              {profile.phone && <InfoCard label="Phone" value={profile.phone} />}
              {profile.email && <InfoCard label="Email" value={profile.email} />}
              {profile.address && <InfoCard label="Address" value={profile.address} />}

              {formattedBirthday && (
                <InfoCard label="Birthday" value={formattedBirthday} />
              )}

              {formattedJoinedDate && (
                <InfoCard label="Member Since" value={formattedJoinedDate} />
              )}
            </View>
          </ScrollView>

          {canMessage && (
            <View className="px-6 pb-6">
              <TouchableOpacity
                onPress={handleStartChat}
                disabled={startingChat}
                activeOpacity={0.9}
                className="bg-primary-500 px-4 py-3 rounded-xl flex-row items-center justify-center"
              >
                {startingChat ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Image
                      source={icons.chat}
                      className="w-5 h-5 mr-2"
                      style={{ tintColor: 'white' }}
                    />
                    <Text className="text-white font-JakartaSemiBold text-base">
                      Message {displayName.split(' ')[0]}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}
