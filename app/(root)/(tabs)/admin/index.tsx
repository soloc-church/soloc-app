// app/(root)/(tabs)/admin/index.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, ScrollView, TouchableOpacity, Image } from "react-native";
import { router } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthz } from "@/hooks/useAuthz";

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalMinistries: number;
  totalGroups: number;
  pendingRequests: number;
  recentActivity: number;
}

interface AdminAction {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  route: string;
  bgColor: string;
  iconColor: string;
}

const adminActions: AdminAction[] = [
  {
    id: 'members',
    title: 'Members',
    subtitle: 'Manage church members',
    icon: icons.person,
    route: '/(root)/(tabs)/admin/members',
    bgColor: 'bg-blue-50',
    iconColor: '#3B82F6'
  },
  {
    id: 'roles',
    title: 'Roles',
    subtitle: 'Assign and manage roles',
    icon: icons.lock,
    route: '/(root)/(tabs)/admin/roles',
    bgColor: 'bg-purple-50',
    iconColor: '#8B5CF6'
  },
  {
    id: 'ministries',
    title: 'Ministries',
    subtitle: 'Manage ministries & teams',
    icon: icons.home,
    route: '/(root)/(tabs)/admin/ministries',
    bgColor: 'bg-green-50',
    iconColor: '#10B981'
  },
  {
    id: 'audit',
    title: 'Audit Logs',
    subtitle: 'View system activity',
    icon: icons.history,
    route: '/(root)/(tabs)/admin/audit',
    bgColor: 'bg-orange-50',
    iconColor: '#F97316'
  }
];

const StatCard = ({ label, value, trend }: { label: string; value: number; trend?: number }) => (
  <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-1 mx-1">
    <Text className="text-sm text-gray-500 font-JakartaMedium">{label}</Text>
    <View className="flex-row items-end mt-2">
      <Text className="text-2xl font-JakartaBold text-gray-900">{value}</Text>
      {trend !== undefined && (
        <View className={`ml-2 px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
          <Text className={`text-xs font-JakartaSemiBold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </Text>
        </View>
      )}
    </View>
  </View>
);

const ActionCard = ({ action }: { action: AdminAction }) => (
  <TouchableOpacity
    onPress={() => router.push(action.route as any)}
    className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 mb-3"
  >
    <View className="flex-row items-center">
      <View className={`w-12 h-12 ${action.bgColor} rounded-xl items-center justify-center mr-4`}>
        <Image source={action.icon} className="w-6 h-6" style={{ tintColor: action.iconColor }} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-JakartaSemiBold text-gray-900">{action.title}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">{action.subtitle}</Text>
      </View>
      <Image
        source={icons.arrowRight}
        className="w-5 h-5"
        style={{ tintColor: '#9CA3AF', transform: [{ rotate: '180deg' }] }}
      />
    </View>
  </TouchableOpacity>
);

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalMembers: 0,
    activeMembers: 0,
    totalMinistries: 0,
    totalGroups: 0,
    pendingRequests: 0,
    recentActivity: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      const [
        { count: totalMembers },
        { count: activeMembers },
        { count: totalMinistries },
        { count: totalGroups },
        { count: pendingRequests },
        { count: recentActivity }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('ministries').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('group_chats').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('join_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('role_events').select('*', { count: 'exact', head: true })
          .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      ]);

      setStats({
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        totalMinistries: totalMinistries || 0,
        totalGroups: totalGroups || 0,
        pendingRequests: pendingRequests || 0,
        recentActivity: recentActivity || 0
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="bg-white px-6 pt-6 pb-4 border-b border-gray-50">
          <Text className="text-2xl font-JakartaBold text-gray-900">Admin Dashboard</Text>
          <Text className="text-sm text-gray-500 mt-1">Manage your church community</Text>
        </View>

        {/* Stats Overview */}
        <View className="px-4 mt-6">
          <Text className="text-lg font-JakartaSemiBold text-gray-900 mb-4 px-2">Overview</Text>
          
          <View className="flex-row mb-3">
            <StatCard label="Total Members" value={stats.totalMembers} />
            <StatCard label="Active" value={stats.activeMembers} trend={5} />
          </View>
          
          <View className="flex-row mb-3">
            <StatCard label="Ministries" value={stats.totalMinistries} />
            <StatCard label="Groups" value={stats.totalGroups} />
          </View>

          {stats.pendingRequests > 0 && (
            <TouchableOpacity 
              onPress={() => router.push('/(root)/(tabs)/admin/members')}
              className="bg-orange-50 rounded-2xl p-4 border border-orange-200 mb-3"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-orange-100 rounded-full items-center justify-center mr-3">
                    <Image source={icons.notification} className="w-5 h-5" style={{ tintColor: '#F97316' }} />
                  </View>
                  <View>
                    <Text className="text-sm font-JakartaSemiBold text-orange-900">
                      {stats.pendingRequests} Pending Requests
                    </Text>
                    <Text className="text-xs text-orange-700 mt-0.5">
                      Review join requests
                    </Text>
                  </View>
                </View>
                <Image
                  source={icons.arrowRight}
                  className="w-4 h-4"
                  style={{ tintColor: '#F97316', transform: [{ rotate: '180deg' }] }}
                />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Actions */}
        <View className="px-4 mt-6 mb-20">
          <Text className="text-lg font-JakartaSemiBold text-gray-900 mb-4 px-2">Quick Actions</Text>
          {adminActions.map(action => (
            <ActionCard key={action.id} action={action} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AdminDashboard;