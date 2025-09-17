// app/(root)/(tabs)/message/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { icons } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { streamChatService } from '@/lib/services/streamChatService';
import { supabase } from '@/lib/supabase';
import { useAuthz } from '@/hooks/useAuthz';
import { can } from '@/lib/rbac/permissions';

// Tab Components
import DiscoverTab from '@/components/messages/DiscoverTab';
import MessagesTab from '@/components/messages/MessagesTab';

type TabType = 'messages' | 'discover';

export default function MessageScreen() {
  const { user } = useAuth();
  const { authz } = useAuthz();
  const [activeTab, setActiveTab] = useState<TabType>('messages');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [slideAnim] = useState(new Animated.Value(0));
  const [fadeAnim] = useState(new Animated.Value(1));

  // Initialize Stream Chat
  useEffect(() => {
    if (user?.id) {
      initializeChat();
    }
    
    return () => {
      streamChatService.disconnect();
    };
  }, [user?.id]);

  const initializeChat = async () => {
    try {
      setLoading(true);
      await streamChatService.connectUser();
    } catch (error) {
      console.error('Failed to connect to chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return;

    // Animate tab transition
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: tab === 'discover' ? -100 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActiveTab(tab);
      setSearchQuery(''); // Clear search when switching tabs
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#A89BB5" />
          <Text className="text-gray-500 mt-3">Connecting to chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-100">
        {/* Title */}
        <View className="px-4 pt-4 pb-3">
          <Text className="text-2xl font-JakartaBold text-gray-900">Messages</Text>
        </View>

        {/* Tab Selector */}
        <View className="flex-row px-4 pb-3">
          <TouchableOpacity
            onPress={() => handleTabChange('messages')}
            className={`flex-1 py-2 rounded-l-xl ${
              activeTab === 'messages' 
                ? 'bg-primary-500' 
                : 'bg-gray-100'
            }`}
          >
            <Text className={`text-center font-JakartaSemiBold ${
              activeTab === 'messages' ? 'text-white' : 'text-gray-600'
            }`}>
              Messages
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => handleTabChange('discover')}
            className={`flex-1 py-2 rounded-r-xl ${
              activeTab === 'discover' 
                ? 'bg-primary-500' 
                : 'bg-gray-100'
            }`}
          >
            <Text className={`text-center font-JakartaSemiBold ${
              activeTab === 'discover' ? 'text-white' : 'text-gray-600'
            }`}>
              Discover
            </Text>
          </TouchableOpacity>
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
              placeholder={
                activeTab === 'messages' 
                  ? "Search messages..." 
                  : "Search groups..."
              }
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 text-base font-Jakarta text-gray-900"
              placeholderTextColor="#9CA3AF"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Image 
                  source={icons.close} 
                  className="w-4 h-4" 
                  style={{ tintColor: '#9CA3AF' }} 
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Tab Content */}
      <Animated.View 
        className="flex-1"
        style={{
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        }}
      >
        {activeTab === 'messages' ? (
          <MessagesTab searchQuery={searchQuery} />
        ) : (
          <DiscoverTab 
            searchQuery={searchQuery} 
            canCreateGroup={can.manageGroupChat(authz)}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}