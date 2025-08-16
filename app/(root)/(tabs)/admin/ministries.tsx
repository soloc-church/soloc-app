// app/(root)/(tabs)/admin/ministries.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthz } from "@/hooks/useAuthz";

interface Ministry {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  teamCount?: number;
  groupCount?: number;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  ministry_id: string;
  is_active: boolean;
}

const MinistryManagement = () => {
  const { isElder } = usePermissions();
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [createType, setCreateType] = useState<'ministry' | 'team'>('ministry');
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isElder) {
      Alert.alert('Access Denied', 'You need elder privileges or higher to manage ministries');
      router.back();
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load ministries with counts
      const { data: ministriesData } = await supabase
        .from('ministries')
        .select(`
          *,
          teams!teams_ministry_id_fkey(count),
          group_chats!group_chats_ministry_id_fkey(count)
        `)
        .order('name');

      const formattedMinistries = (ministriesData || []).map(m => ({
        ...m,
        teamCount: m.teams?.[0]?.count || 0,
        groupCount: m.group_chats?.[0]?.count || 0
      }));

      setMinistries(formattedMinistries);

      // Load all teams
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      setTeams(teamsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load ministries');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMinistry = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Ministry name is required');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ministries')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          created_by: user?.id,
          is_active: true
        });

      if (error) throw error;

      Alert.alert('Success', 'Ministry created successfully');
      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      await loadData();
    } catch (error: any) {
      console.error('Error creating ministry:', error);
      Alert.alert('Error', error.message || 'Failed to create ministry');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!formData.name.trim() || !selectedMinistry) {
      Alert.alert('Error', 'Team name is required');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('teams')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          ministry_id: selectedMinistry.id,
          created_by: user?.id,
          is_active: true
        });

      if (error) throw error;

      Alert.alert('Success', 'Team created successfully');
      setShowTeamModal(false);
      setFormData({ name: '', description: '' });
      await loadData();
    } catch (error: any) {
      console.error('Error creating team:', error);
      Alert.alert('Error', error.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleMinistry = async (ministry: Ministry) => {
    const newStatus = !ministry.is_active;
    Alert.alert(
      newStatus ? 'Activate Ministry' : 'Deactivate Ministry',
      `Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} ${ministry.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('ministries')
              .update({ is_active: newStatus })
              .eq('id', ministry.id);

            if (error) {
              Alert.alert('Error', 'Failed to update ministry');
            } else {
              await loadData();
            }
          }
        }
      ]
    );
  };

  const MinistryCard = ({ ministry }: { ministry: Ministry }) => (
    <View className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-JakartaSemiBold text-gray-900">
              {ministry.name}
            </Text>
            {!ministry.is_active && (
              <View className="px-2 py-0.5 bg-gray-100 rounded-full">
                <Text className="text-xs text-gray-600">Inactive</Text>
              </View>
            )}
          </View>
          {ministry.description && (
            <Text className="text-sm text-gray-500 mt-1">{ministry.description}</Text>
          )}
          <View className="flex-row gap-4 mt-2">
            <Text className="text-xs text-gray-400">
              {ministry.teamCount} team{ministry.teamCount !== 1 ? 's' : ''}
            </Text>
            <Text className="text-xs text-gray-400">
              {ministry.groupCount} group{ministry.groupCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row gap-2 mt-3">
        <TouchableOpacity
          onPress={() => {
            setSelectedMinistry(ministry);
            setShowTeamModal(true);
          }}
          className="flex-1 bg-primary-50 rounded-lg py-2"
        >
          <Text className="text-primary-600 font-JakartaMedium text-center text-sm">
            Add Team
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleToggleMinistry(ministry)}
          className={`flex-1 rounded-lg py-2 ${
            ministry.is_active ? 'bg-gray-50' : 'bg-green-50'
          }`}
        >
          <Text className={`font-JakartaMedium text-center text-sm ${
            ministry.is_active ? 'text-gray-600' : 'text-green-600'
          }`}>
            {ministry.is_active ? 'Deactivate' : 'Activate'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
            <Text className="text-xl font-JakartaBold text-gray-900">Ministry Management</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setCreateType('ministry');
              setShowCreateModal(true);
            }}
            className="bg-primary-500 px-3 py-1.5 rounded-lg"
          >
            <Text className="text-white font-JakartaMedium text-sm">+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#A89BB5" />
          </View>
        ) : ministries.length === 0 ? (
          <View className="flex-1 justify-center items-center py-20">
            <Text className="text-gray-500 font-JakartaMedium">No ministries found</Text>
            <TouchableOpacity
              onPress={() => {
                setCreateType('ministry');
                setShowCreateModal(true);
              }}
              className="mt-4 bg-primary-500 px-4 py-2 rounded-lg"
            >
              <Text className="text-white font-JakartaMedium">Create First Ministry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text className="text-sm text-gray-500 font-JakartaMedium mb-3">
              {ministries.filter(m => m.is_active).length} active ministries
            </Text>
            
            {ministries.map(ministry => (
              <MinistryCard key={ministry.id} ministry={ministry} />
            ))}
            
            <View className="h-20" />
          </>
        )}
      </ScrollView>

      {/* Create Ministry Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-JakartaBold text-gray-900 mb-4">
              Create New Ministry
            </Text>

            <View className="mb-4">
              <Text className="text-sm font-JakartaMedium text-gray-700 mb-2">Name *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter ministry name"
                className="bg-gray-50 rounded-xl px-4 py-3 text-base font-Jakarta text-gray-900"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View className="mb-6">
              <Text className="text-sm font-JakartaMedium text-gray-700 mb-2">Description</Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Enter description (optional)"
                className="bg-gray-50 rounded-xl px-4 py-3 text-base font-Jakarta text-gray-900"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setFormData({ name: '', description: '' });
                }}
                className="flex-1 bg-gray-100 rounded-xl py-3"
                disabled={creating}
              >
                <Text className="text-gray-700 font-JakartaSemiBold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateMinistry}
                className="flex-1 bg-primary-500 rounded-xl py-3"
                disabled={creating || !formData.name.trim()}
              >
                {creating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-JakartaSemiBold text-center">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Team Modal */}
      <Modal
        visible={showTeamModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTeamModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-JakartaBold text-gray-900 mb-2">
              Create New Team
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              For {selectedMinistry?.name}
            </Text>

            <View className="mb-4">
              <Text className="text-sm font-JakartaMedium text-gray-700 mb-2">Name *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter team name"
                className="bg-gray-50 rounded-xl px-4 py-3 text-base font-Jakarta text-gray-900"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View className="mb-6">
              <Text className="text-sm font-JakartaMedium text-gray-700 mb-2">Description</Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Enter description (optional)"
                className="bg-gray-50 rounded-xl px-4 py-3 text-base font-Jakarta text-gray-900"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  setShowTeamModal(false);
                  setFormData({ name: '', description: '' });
                }}
                className="flex-1 bg-gray-100 rounded-xl py-3"
                disabled={creating}
              >
                <Text className="text-gray-700 font-JakartaSemiBold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateTeam}
                className="flex-1 bg-primary-500 rounded-xl py-3"
                disabled={creating || !formData.name.trim()}
              >
                {creating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-JakartaSemiBold text-center">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default MinistryManagement;