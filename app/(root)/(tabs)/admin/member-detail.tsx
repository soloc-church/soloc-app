// app/(root)/(tabs)/admin/member-detail.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RoleService } from "@/lib/services/roleService";
import { Database } from "@/types/database.types";
import { AuditService } from "@/lib/services/auditService";

type GlobalRole = Database['public']['Enums']['global_role'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const roleHierarchy: GlobalRole[] = ['admin', 'pastor', 'elder', 'member', 'guest'];

const MemberDetail = () => {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [member, setMember] = useState<Profile | null>(null);
  const [contextualRoles, setContextualRoles] = useState<any[]>([]);
  const [roleHistory, setRoleHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedNewRole, setSelectedNewRole] = useState<GlobalRole>('guest');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (userId) {
      loadMemberDetails();
    }
  }, [userId]);

  const loadMemberDetails = async () => {
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setMember(profileData);
      setSelectedNewRole(profileData.global_role);

      // Load contextual roles
      const roles = await RoleService.getUserContextualRoles(userId);
      setContextualRoles(roles);

      // Load role history
      const history = await RoleService.getRoleHistory(userId, 10);
      setRoleHistory(history);
    } catch (error) {
      console.error('Error loading member details:', error);
      Alert.alert('Error', 'Failed to load member details');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeGlobalRole = async () => {
    if (!member || selectedNewRole === member.global_role) {
      setShowRoleModal(false);
      return;
    }

    Alert.alert(
      'Confirm Role Change',
      `Change ${member.full_name || 'this user'}'s role from ${member.global_role} to ${selectedNewRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            const result = await RoleService.updateGlobalRole(
              userId,
              selectedNewRole,
              `Role changed from ${member.global_role} to ${selectedNewRole}`
            );

            if (result.success) {
              Alert.alert('Success', 'Role updated successfully');
              await loadMemberDetails();
              setShowRoleModal(false);
            } else {
              Alert.alert('Error', result.error || 'Failed to update role');
            }
            setUpdating(false);
          }
        }
      ]
    );
  };

  const handleToggleActive = async () => {
    if (!member) return;

    const newStatus = !member.is_active;
    Alert.alert(
      newStatus ? 'Reactivate Member' : 'Deactivate Member',
      `Are you sure you want to ${newStatus ? 'reactivate' : 'deactivate'} ${member.full_name || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            if (newStatus) {
              await AuditService.reactivateMember(userId);
            } else {
              await AuditService.markMemberInactive(userId, 'Admin action');
            }
            await loadMemberDetails();
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#A89BB5" />
      </SafeAreaView>
    );
  }

  if (!member) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <Text className="text-gray-500">Member not found</Text>
      </SafeAreaView>
    );
  }

  const initialLetter = member.full_name?.charAt(0)?.toUpperCase() || 
                        member.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-4 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
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
            <Text className="text-xl font-JakartaBold text-gray-900">Member Details</Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View className="bg-white p-6 border-b border-gray-100">
          <View className="items-center">
            <View className="w-24 h-24 bg-primary-100 rounded-full items-center justify-center mb-4">
              {member.profile_image_url ? (
                <Image
                  source={{ uri: member.profile_image_url }}
                  className="w-24 h-24 rounded-full"
                />
              ) : (
                <Text className="text-3xl font-JakartaBold text-primary-600">
                  {initialLetter}
                </Text>
              )}
            </View>
            <Text className="text-xl font-JakartaBold text-gray-900">
              {member.full_name || 'Unnamed User'}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">{member.email}</Text>
            
            <View className="flex-row items-center gap-2 mt-3">
              <View className={`px-3 py-1 rounded-full ${
                member.global_role === 'admin' ? 'bg-red-100' :
                member.global_role === 'pastor' ? 'bg-purple-100' :
                member.global_role === 'elder' ? 'bg-blue-100' :
                member.global_role === 'member' ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <Text className={`text-sm font-JakartaSemiBold capitalize ${
                  member.global_role === 'admin' ? 'text-red-700' :
                  member.global_role === 'pastor' ? 'text-purple-700' :
                  member.global_role === 'elder' ? 'text-blue-700' :
                  member.global_role === 'member' ? 'text-green-700' : 'text-gray-700'
                }`}>
                  {member.global_role}
                </Text>
              </View>
              
              {!member.is_active && (
                <View className="px-3 py-1 bg-red-100 rounded-full">
                  <Text className="text-sm font-JakartaSemiBold text-red-700">Inactive</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="bg-white p-4 border-b border-gray-100">
          <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-3">Actions</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setShowRoleModal(true)}
              className="flex-1 bg-primary-500 rounded-xl py-3"
            >
              <Text className="text-white font-JakartaSemiBold text-center">Change Role</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleActive}
              className={`flex-1 rounded-xl py-3 ${
                member.is_active ? 'bg-red-500' : 'bg-green-500'
              }`}
            >
              <Text className="text-white font-JakartaSemiBold text-center">
                {member.is_active ? 'Deactivate' : 'Reactivate'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Member Info */}
        <View className="bg-white p-4 border-b border-gray-100">
          <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-3">Information</Text>
          <View className="space-y-2">
            {member.phone && (
              <View className="flex-row justify-between py-2">
                <Text className="text-gray-500">Phone</Text>
                <Text className="text-gray-900 font-JakartaMedium">{member.phone}</Text>
              </View>
            )}
            <View className="flex-row justify-between py-2">
              <Text className="text-gray-500">Joined</Text>
              <Text className="text-gray-900 font-JakartaMedium">
                {member.joined_date ? formatDate(member.joined_date) : 'Unknown'}
              </Text>
            </View>
            <View className="flex-row justify-between py-2">
              <Text className="text-gray-500">Last Active</Text>
              <Text className="text-gray-900 font-JakartaMedium">
                {member.last_active_at ? formatDate(member.last_active_at) : 'Never'}
              </Text>
            </View>
          </View>
        </View>

        {/* Contextual Roles */}
        {contextualRoles.length > 0 && (
          <View className="bg-white p-4 border-b border-gray-100">
            <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-3">
              Contextual Roles ({contextualRoles.length})
            </Text>
            {contextualRoles.map((role, index) => (
              <View key={index} className="py-2 border-b border-gray-50">
                <Text className="text-gray-900 font-JakartaMedium capitalize">
                  {role.role_type.replace('_', ' ')}
                </Text>
                <Text className="text-sm text-gray-500">
                  {role.scope_type}: {role.ministry?.name || role.team?.name || role.group_chat?.name || 'Unknown'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Role History */}
        {roleHistory.length > 0 && (
          <View className="bg-white p-4 mb-20">
            <Text className="text-sm font-JakartaSemiBold text-gray-500 uppercase mb-3">
              Recent Role Changes
            </Text>
            {roleHistory.map((event, index) => (
              <View key={index} className="py-3 border-b border-gray-50">
                <Text className="text-gray-900 font-JakartaMedium">
                  {event.action === 'assigned' ? 'Assigned' : 'Revoked'}: {event.role_assigned}
                </Text>
                <Text className="text-sm text-gray-500 mt-1">
                  By {event.actor?.full_name || 'System'} • {formatDate(event.timestamp)}
                </Text>
                {event.reason && (
                  <Text className="text-sm text-gray-400 mt-1">{event.reason}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Role Change Modal */}
      <Modal
        visible={showRoleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-JakartaBold text-gray-900 mb-4">
              Change Global Role
            </Text>
            
            <View className="space-y-2 mb-6">
              {roleHierarchy.map(role => (
                <TouchableOpacity
                  key={role}
                  onPress={() => setSelectedNewRole(role)}
                  className={`p-4 rounded-xl border ${
                    selectedNewRole === role 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-200'
                  }`}
                >
                  <Text className={`font-JakartaSemiBold capitalize ${
                    selectedNewRole === role ? 'text-primary-700' : 'text-gray-700'
                  }`}>
                    {role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowRoleModal(false)}
                className="flex-1 bg-gray-100 rounded-xl py-3"
                disabled={updating}
              >
                <Text className="text-gray-700 font-JakartaSemiBold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChangeGlobalRole}
                className="flex-1 bg-primary-500 rounded-xl py-3"
                disabled={updating || selectedNewRole === member?.global_role}
              >
                {updating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-JakartaSemiBold text-center">Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default MemberDetail;