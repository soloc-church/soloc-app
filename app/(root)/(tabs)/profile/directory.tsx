// app/(root)/(tabs)/profile/directory.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { supabase } from '@/lib/supabase';
import { ProfileService } from '@/lib/services/profileService';
import { Database } from '@/types/database.types';

type DirectoryProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'phone' | 'profile_image_url' | 'global_role' | 'is_active'
>;

export default function DirectoryScreen() {
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<Database['public']['Enums']['global_role'] | null>(null);

  useEffect(() => {
    initializeDirectory();
  }, []);

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
      console.error('Error loading directory:', err);
      setProfiles([]);
      setLoading(false);
    }
  };

  const loadProfiles = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, profile_image_url, global_role, is_active')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      const filtered = (data || []).filter(p => p.id !== user?.id);
      setProfiles(filtered);
    } catch (error) {
      console.error('Error loading profiles:', error);
      setProfiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredProfiles = profiles.filter(profile => {
    const name = profile.full_name?.toLowerCase() || '';
    const email = profile.email?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const renderProfile = ({ item }: { item: DirectoryProfile }) => {
    const displayName = item.full_name?.trim() || 'Unnamed Member';
    const roleColors = {
      admin: 'text-red-600',
      pastor: 'text-purple-600',
      elder: 'text-blue-600',
      member: 'text-green-600',
      guest: 'text-gray-600'
    };

    return (
      <TouchableOpacity
        onPress={() => router.push({
          pathname: '/(root)/(tabs)/profile/directory/[id]',
          params: { id: item.id },
        })}
        className="bg-white px-4 py-4 flex-row items-center"
        activeOpacity={0.8}
      >
        {/* Avatar */}
        <View className="w-14 h-14 bg-gray-100 rounded-full items-center justify-center mr-4">
          {item.profile_image_url ? (
            <Image
              source={{ uri: item.profile_image_url }}
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <Text className="text-xl font-JakartaBold text-gray-600">
              {displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        {/* Profile Info */}
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-gray-900">
            {displayName}
          </Text>
          {item.global_role && (
            <Text className={`text-sm capitalize mt-1 ${
              roleColors[item.global_role] || 'text-gray-500'
            }`}>
              {item.global_role}
            </Text>
          )}
        </View>

        {/* Arrow */}
        <Image
          source={icons.arrowRight}
          className="w-5 h-5"
          style={{ tintColor: '#D1D5DB', transform: [{ rotate: '180deg' }] }}
        />
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

  if (userRole === 'guest') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="bg-white px-4 py-3">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3">
              <Image
                source={icons.backArrow}
                className="w-6 h-6"
                style={{ tintColor: '#4B5563' }}
              />
            </TouchableOpacity>
            <Text className="text-xl font-JakartaBold text-gray-900">
              Directory
            </Text>
          </View>
        </View>
        
        <View className="flex-1 justify-center items-center px-8">
          <View className="w-20 h-20 bg-gray-100 rounded-full items-center justify-center mb-4">
            <Image
              source={icons.lock}
              className="w-10 h-10"
              style={{ tintColor: '#9CA3AF' }}
            />
          </View>
          <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
            Members Only
          </Text>
          <Text className="text-gray-500 text-center">
            The directory is available to church members. Please contact a leader for access.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white">
        <View className="px-4 py-3 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Image
              source={icons.backArrow}
              className="w-6 h-6"
              style={{ tintColor: '#4B5563' }}
            />
          </TouchableOpacity>
          <Text className="text-xl font-JakartaBold text-gray-900">
            Directory
          </Text>
        </View>

        {/* Search Bar */}
        <View className="px-4 pb-3">
          <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center">
            <Image 
              source={icons.search} 
              className="w-5 h-5 mr-3" 
              style={{ tintColor: '#9CA3AF' }} 
            />
            <TextInput
              placeholder="Search members..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 text-base font-Jakarta text-gray-900"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>
      </View>

      {/* Member List */}
      <FlatList
        data={filteredProfiles}
        renderItem={renderProfile}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadProfiles(true)}
            colors={['#A89BB5']}
          />
        }
        ItemSeparatorComponent={() => <View className="h-px bg-gray-100 ml-[86px]" />}
        ListEmptyComponent={() => (
          <View className="flex-1 justify-center items-center px-8 py-20">
            <Text className="text-xl font-JakartaSemiBold text-gray-900 text-center mb-2">
              {searchQuery ? 'No Results' : 'No Members'}
            </Text>
            <Text className="text-gray-500 text-center">
              {searchQuery 
                ? `No members found for "${searchQuery}"`
                : 'The directory is empty'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}