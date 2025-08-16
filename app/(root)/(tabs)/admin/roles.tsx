// app/(root)/(tabs)/admin/roles.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RoleService } from "@/lib/services/roleService";
import { useAuthz } from "@/hooks/useAuthz";
import { can } from "@/lib/rbac/permissions";
import type { Database } from "@/types/database.types";

// Use generated enums from your Supabase types (after promoting TEXT+CHECK to ENUMs)
type ScopeType = Database["public"]["Enums"]["scope_type"]; // 'ministry' | 'team' | 'group_chat'
type RoleType = Database["public"]["Enums"]["contextual_role_type"]; // 'ministry_leader' | 'team_leader' | 'group_leader' | 'member'

interface Scope {
  id: string;
  name: string;
  type: ScopeType;
  description?: string | null;
  parent?: string | null;
}

interface MemberRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

const RoleManagement = () => {
  const { authz, loading: authzLoading } = useAuthz();

  // Tabs
  const [activeTab, setActiveTab] = useState<ScopeType>("ministry");

  // Data
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedScope, setSelectedScope] = useState<Scope | null>(null);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<RoleType>("member");
  const [searchQuery, setSearchQuery] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Debounce search so we don't spam RPCs while typing
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const tabs: { key: ScopeType; label: string; icon: any }[] = useMemo(
    () => [
      { key: "ministry", label: "Ministries", icon: icons.home },
      { key: "team", label: "Teams", icon: icons.person },
      { key: "group_chat", label: "Groups", icon: icons.chat },
    ],
    []
  );

  // Spinner while we determine capabilities
  if (authzLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#A89BB5" />
      </SafeAreaView>
    );
  }

  if (!can.openAdminPanel(authz)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-gray-700 text-center">
          You don’t have access to Role Management.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-gray-100 px-4 py-2 rounded-xl"
        >
          <Text className="text-gray-700">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Load scopes + members (server-authoritative reads via RPC)
  const loadData = async (opts?: { fetchMembersOnly?: boolean }) => {
    try {
      if (!opts?.fetchMembersOnly) setLoading(true);

      if (!opts?.fetchMembersOnly) {
        const { data: scopesRes, error: scopesErr } = await supabase.rpc(
          "list_scopes",
          { p_scope_type: activeTab }
        );
        if (scopesErr) throw scopesErr;
        setScopes((scopesRes as Scope[]) ?? []);
      }

      const { data: membersRes, error: membersErr } = await supabase.rpc(
        "list_assignable_members",
        { q: searchQuery || null, limit: 50 }
      );
      if (membersErr) throw membersErr;
      setMembers((membersRes as MemberRow[]) ?? []);
    } catch (e) {
      console.error("Error loading data:", e);
      Alert.alert("Error", "Failed to load data");
    } finally {
      if (!opts?.fetchMembersOnly) setLoading(false);
    }
  };

  // Initial + tab change fetch
  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Debounced member search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadData({ fetchMembersOnly: true });
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const getRoleTypeForScope = (scopeType: ScopeType): RoleType[] => {
    switch (scopeType) {
      case "ministry":
        return ["ministry_leader", "member"];
      case "team":
        return ["team_leader", "member"];
      case "group_chat":
        return ["group_leader", "member"];
    }
  };

  const handleAssignRole = async () => {
    if (!selectedScope || !selectedMember || !selectedRole) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    setAssigning(true);
    try {
      const res = await RoleService.assignContextualRole(
        selectedMember,
        selectedRole,
        selectedScope.type,
        selectedScope.id,
        "Assigned via admin interface"
      );

    if ('error' in res) throw new Error(res.error ?? 'RPC failed');

      Alert.alert("Success", "Role assigned successfully");
      setShowAssignModal(false);
      setSelectedMember("");
      setSelectedRole("member");
      await loadData();
    } catch (e: any) {
      console.error("assign failed:", e);
      Alert.alert("Error", e.message ?? "Failed to assign role");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-4 border-b border-gray-100">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Image source={icons.arrowRight} className="w-6 h-6" style={{ tintColor: "#374151" }} />
          </TouchableOpacity>
          <Text className="text-xl font-JakartaBold text-gray-900">Role Management</Text>
        </View>
      </View>

      {/* Tabs */}
      <View className="bg-white border-b border-gray-100">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-row items-center px-4 py-2 rounded-full mr-2 ${
                activeTab === tab.key ? "bg-primary-500" : "bg-gray-100"
              }`}
            >
              <Image
                source={tab.icon}
                className="w-4 h-4 mr-2"
                style={{ tintColor: activeTab === tab.key ? "white" : "#6B7280" }}
              />
              <Text
                className={`text-sm font-JakartaSemiBold ${
                  activeTab === tab.key ? "text-white" : "text-gray-700"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#A89BB5" />
          </View>
        ) : scopes.length === 0 ? (
          <View className="flex-1 justify-center items-center py-20">
            <Text className="text-gray-500 font-JakartaMedium">
              No {activeTab.replace("_", " ")}s found
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-sm text-gray-500 font-JakartaMedium mb-3">
              {scopes.length} {activeTab.replace("_", " ")}
              {scopes.length !== 1 ? "s" : ""}
            </Text>

            {scopes.map((scope) => {
              const canAssignHere = can.assignInScope(authz, scope.type, scope.id);
              return (
                <TouchableOpacity
                  key={scope.id}
                  onPress={() => {
                    if (!canAssignHere) {
                      Alert.alert("Insufficient privileges", "You can’t assign roles in this scope.");
                      return;
                    }
                    setSelectedScope(scope);
                    setSelectedRole(getRoleTypeForScope(scope.type)[0]);
                    setShowAssignModal(true);
                  }}
                  className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100"
                  activeOpacity={canAssignHere ? 0.7 : 1}
                  style={{ opacity: canAssignHere ? 1 : 0.65 }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-base font-JakartaSemiBold text-gray-900">{scope.name}</Text>
                      {scope.parent ? (
                        <Text className="text-sm text-gray-500 mt-0.5">{scope.parent}</Text>
                      ) : null}
                      {scope.description ? (
                        <Text className="text-sm text-gray-400 mt-1">{scope.description}</Text>
                      ) : null}
                    </View>
                    <View className={`${canAssignHere ? "bg-primary-100" : "bg-gray-100"} px-3 py-2 rounded-lg`}>
                      <Text
                        className={`${
                          canAssignHere ? "text-primary-600" : "text-gray-400"
                        } font-JakartaSemiBold text-sm`}
                      >
                        Assign Role
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View className="h-20" />
          </>
        )}
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal
        visible={showAssignModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
            <Text className="text-xl font-JakartaBold text-gray-900 mb-2">Assign Role</Text>
            <Text className="text-sm text-gray-500 mb-4">{selectedScope?.name}</Text>

            {/* Search Members */}
            <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center mb-4">
              <Image source={icons.search} className="w-5 h-5 mr-3" style={{ tintColor: "#9CA3AF" }} />
              <TextInput
                placeholder="Search members..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 text-base font-Jakarta text-gray-900"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {/* Role Selection */}
            {selectedScope ? (
              <>
                <Text className="text-sm font-JakartaSemiBold text-gray-700 mb-2">Select Role</Text>
                <View className="flex-row gap-2 mb-4">
                  {getRoleTypeForScope(selectedScope.type).map((role) => (
                    <TouchableOpacity
                      key={role}
                      onPress={() => setSelectedRole(role)}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        selectedRole === role ? "border-primary-500 bg-primary-50" : "border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-sm font-JakartaMedium capitalize text-center ${
                          selectedRole === role ? "text-primary-700" : "text-gray-700"
                        }`}
                      >
                        {role.replace("_", " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {/* Member List */}
            <Text className="text-sm font-JakartaSemiBold text-gray-700 mb-2">Select Member</Text>
            <ScrollView className="max-h-48 mb-4">
              {members.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  onPress={() => setSelectedMember(member.id)}
                  className={`p-3 rounded-lg mb-2 border ${
                    selectedMember === member.id ? "border-primary-500 bg-primary-50" : "border-gray-200"
                  }`}
                >
                  <Text
                    className={`font-JakartaMedium ${
                      selectedMember === member.id ? "text-primary-700" : "text-gray-900"
                    }`}
                  >
                    {member.full_name || member.email}
                  </Text>
                  <Text
                    className={`text-sm ${
                      selectedMember === member.id ? "text-primary-600" : "text-gray-500"
                    }`}
                  >
                    {member.email}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Actions */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  setShowAssignModal(false);
                  setSearchQuery("");
                  setSelectedMember("");
                }}
                className="flex-1 bg-gray-100 rounded-xl py-3"
                disabled={assigning}
              >
                <Text className="text-gray-700 font-JakartaSemiBold text-center">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAssignRole}
                className={`flex-1 rounded-xl py-3 ${
                  selectedScope && can.assignInScope(authz, selectedScope.type, selectedScope.id)
                    ? "bg-primary-500"
                    : "bg-gray-300"
                }`}
                disabled={
                  assigning ||
                  !selectedMember ||
                  !selectedScope ||
                  !can.assignInScope(authz, selectedScope?.type as ScopeType, selectedScope?.id as string)
                }
              >
                {assigning ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-JakartaSemiBold text-center">Assign</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default RoleManagement;
