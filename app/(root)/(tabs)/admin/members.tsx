// app/(root)/(tabs)/admin/members.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RoleService } from "@/lib/services/roleService";
import { Database } from "@/types/database.types";

type GlobalRole = Database['public']['Enums']['global_role'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface MemberWithDetails extends Profile {
  contextual_roles?: any[];
  group_count?: number;
}

const roleColors: Record<GlobalRole, { bg: string; text: string; border: string }> = {
  admin: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  pastor: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  elder: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  member: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  guest: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
};

const RoleBadge = ({ role }: { role: GlobalRole }) => {
  const colors = roleColors[role];
  return (
    <View className={`px-3 py-1 rounded-full ${colors.bg} border ${colors.border}`}>
      <Text className={`text-xs font-JakartaSemiBold ${colors.text} capitalize`}>
        {role}
      </Text>
    </View>
  );
};

const MemberCard = ({ 
  member, 
  onPress 
}: { 
  member: MemberWithDetails; 
  onPress: () => void;
}) => {
  const initialLetter = member.full_name?.charAt(0)?.toUpperCase() || 
                        member.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100"
    >
      <View className="flex-row items-center">
        <View className="w-12 h-12 bg-primary-100 rounded-full items-center justify-center mr-3">
          {member.profile_image_url ? (
            <Image
              source={{ uri: member.profile_image_url }}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <Text className="text-lg font-JakartaBold text-primary-600">
              {initialLetter}
            </Text>
          )}
        </View>
        
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-JakartaSemiBold text-gray-900">
              {member.full_name || 'Unnamed User'}
            </Text>
            {!member.is_active && (
              <View className="px-2 py-0.5 bg-red-100 rounded-full">
                <Text className="text-xs text-red-600 font-JakartaMedium">Inactive</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-gray-500 mt-0.5">{member.email}</Text>
          {member.contextual_roles && member.contextual_roles.length > 0 && (
            <Text className="text-xs text-gray-400 mt-1">
              {member.contextual_roles.length} contextual role{member.contextual_roles.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        <RoleBadge role={member.global_role} />
      </View>
    </TouchableOpacity>
  );
};

const MemberManagement = () => {
  const [members, setMembers] = useState<MemberWithDetails[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<GlobalRole | 'all'>('all');

  useEffect(() => {
    loadMembers();
  }, []);

  useEffect(() => {
    filterMembers();
  }, [searchQuery, selectedRole, members]);

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          contextual_roles!contextual_roles_user_id_fkey(*)
        `)
        .order('full_name');

      if (error) throw error;

      setMembers(data || []);
      setFilteredMembers(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
      Alert.alert('Error', 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = [...members];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(member => 
        member.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter(member => member.global_role === selectedRole);
    }

    setFilteredMembers(filtered);
  };

  const roles: (GlobalRole | 'all')[] = ['all', 'admin', 'pastor', 'elder', 'member', 'guest'];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-4 border-b border-gray-100">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3"
          >
            <Image
              source={icons.arrowRight}
              className="w-6 h-6"
              style={{ tintColor: '#374151' }}
            />
          </TouchableOpacity>
          <Text className="text-xl font-JakartaBold text-gray-900">Member Management</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center">
          <Image source={icons.search} className="w-5 h-5 mr-3" style={{ tintColor: '#9CA3AF' }} />
          <TextInput
            placeholder="Search members..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-base font-Jakarta text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>

      {/* Role Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        className="bg-white border-b border-gray-100"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        {roles.map(role => (
          <TouchableOpacity
            key={role}
            onPress={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-full mr-2 border ${
              selectedRole === role 
                ? 'bg-primary-500 border-primary-500' 
                : 'bg-white border-gray-200'
            }`}
          >
            <Text className={`text-sm font-JakartaSemiBold capitalize ${
              selectedRole === role ? 'text-white' : 'text-gray-700'
            }`}>
              {role === 'all' ? 'All Members' : role}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Member List */}
      <ScrollView 
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#A89BB5" />
          </View>
        ) : filteredMembers.length === 0 ? (
          <View className="flex-1 justify-center items-center py-20">
            <Image source={icons.search} className="w-16 h-16 mb-4" style={{ tintColor: '#D1D5DB' }} />
            <Text className="text-gray-500 font-JakartaMedium">No members found</Text>
          </View>
        ) : (
          <>
            <Text className="text-sm text-gray-500 font-JakartaMedium mb-3">
              {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
            </Text>
            {filteredMembers.map(member => (
              <MemberCard
                key={member.id}
                member={member}
                onPress={() => router.push({
                  pathname: '/(root)/(tabs)/admin/member-detail',
                  params: { userId: member.id }
                })}
              />
            ))}
            <View className="h-20" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default MemberManagement;