// app/(root)/(tabs)/admin/audit.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { icons } from "@/constants";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthz } from "@/hooks/useAuthz";

interface RoleEvent {
  id: string;
  actor_id: string | null;
  target_id: string;
  role_assigned: string;
  scope_type: string | null;
  scope_id: string | null;
  action: 'assigned' | 'revoked';
  reason: string | null;
  timestamp: string;
  actor?: { full_name: string } | null;
  target?: { full_name: string } | null;
  scope?: { name: string } | null;
}

const AuditLogs = () => {
  const { isElder } = usePermissions();
  const [events, setEvents] = useState<RoleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'global' | 'contextual'>('all');

  useEffect(() => {
    if (!isElder) {
      router.back();
      return;
    }
    loadAuditLogs();
  }, [filter]);

  const loadAuditLogs = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from('role_events')
        .select(`
          *,
          actor:profiles!role_events_actor_id_fkey(full_name),
          target:profiles!role_events_target_id_fkey(full_name)
        `)
        .order('timestamp', { ascending: false })
        .limit(100);

      // Apply filters
      if (filter === 'global') {
        query = query.in('role_assigned', ['admin', 'pastor', 'elder', 'member', 'guest']);
      } else if (filter === 'contextual') {
        query = query.not('scope_type', 'is', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Load scope names for contextual roles
      const eventsWithScopes = await Promise.all((data || []).map(async (event) => {
        if (event.scope_type && event.scope_id) {
          let scopeName = '';
          
          if (event.scope_type === 'ministry') {
            const { data: ministry } = await supabase
              .from('ministries')
              .select('name')
              .eq('id', event.scope_id)
              .single();
            scopeName = ministry?.name || 'Unknown Ministry';
          } else if (event.scope_type === 'team') {
            const { data: team } = await supabase
              .from('teams')
              .select('name')
              .eq('id', event.scope_id)
              .single();
            scopeName = team?.name || 'Unknown Team';
          } else if (event.scope_type === 'group_chat') {
            const { data: group } = await supabase
              .from('group_chats')
              .select('name')
              .eq('id', event.scope_id)
              .single();
            scopeName = group?.name || 'Unknown Group';
          }

          return { ...event, scope: { name: scopeName } };
        }
        return event;
      }));

      setEvents(eventsWithScopes);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'assigned':
        return { icon: icons.checkmark, color: '#10B981' };
      case 'revoked':
        return { icon: icons.close, color: '#EF4444' };
      default:
        return { icon: icons.info, color: '#6B7280' };
    }
  };

  const getRoleColor = (role: string) => {
    if (['admin', 'pastor', 'elder', 'member', 'guest'].includes(role)) {
      // Global roles
      switch (role) {
        case 'admin': return { bg: 'bg-red-50', text: 'text-red-700' };
        case 'pastor': return { bg: 'bg-purple-50', text: 'text-purple-700' };
        case 'elder': return { bg: 'bg-blue-50', text: 'text-blue-700' };
        case 'member': return { bg: 'bg-green-50', text: 'text-green-700' };
        case 'guest': return { bg: 'bg-gray-50', text: 'text-gray-700' };
        default: return { bg: 'bg-gray-50', text: 'text-gray-700' };
      }
    } else {
      // Contextual roles
      return { bg: 'bg-orange-50', text: 'text-orange-700' };
    }
  };

  const EventCard = ({ event }: { event: RoleEvent }) => {
    const actionIcon = getActionIcon(event.action);
    const roleColor = getRoleColor(event.role_assigned);
    const isGlobalRole = ['admin', 'pastor', 'elder', 'member', 'guest'].includes(event.role_assigned);

    return (
      <View className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100">
        <View className="flex-row items-start">
          <View 
            className="w-8 h-8 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${actionIcon.color}20` }}
          >
            <Image 
              source={actionIcon.icon} 
              className="w-4 h-4" 
              style={{ tintColor: actionIcon.color }}
            />
          </View>
          
          <View className="flex-1">
            <View className="flex-row items-center flex-wrap gap-1 mb-1">
              <Text className="text-sm font-JakartaSemiBold text-gray-900">
                {event.actor?.full_name || 'System'}
              </Text>
              <Text className="text-sm text-gray-600">
                {event.action === 'assigned' ? 'assigned' : 'revoked'}
              </Text>
              <View className={`px-2 py-0.5 rounded-full ${roleColor.bg}`}>
                <Text className={`text-xs font-JakartaMedium ${roleColor.text}`}>
                  {event.role_assigned.replace('_', ' ')}
                </Text>
              </View>
              <Text className="text-sm text-gray-600">
                {event.action === 'assigned' ? 'to' : 'from'}
              </Text>
              <Text className="text-sm font-JakartaSemiBold text-gray-900">
                {event.target?.full_name || 'Unknown'}
              </Text>
            </View>

            {event.scope && event.scope_type && (
              <View className="flex-row items-center gap-1 mb-1">
                <Text className="text-xs text-gray-500">in</Text>
                <View className="bg-gray-100 px-2 py-0.5 rounded">
                  <Text className="text-xs text-gray-700">
                    {event.scope_type.replace('_', ' ')}: {event.scope.name}
                  </Text>
                </View>
              </View>
            )}

            {event.reason && (
              <Text className="text-xs text-gray-500 mt-1 italic">
                "{event.reason}"
              </Text>
            )}

            <Text className="text-xs text-gray-400 mt-2">
              {formatTimestamp(event.timestamp)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const filters = [
    { key: 'all', label: 'All Events' },
    { key: 'global', label: 'Global Roles' },
    { key: 'contextual', label: 'Contextual Roles' }
  ];

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
          <Text className="text-xl font-JakartaBold text-gray-900">Audit Logs</Text>
        </View>
      </View>

      {/* Filters */}
      <View className="bg-white border-b border-gray-100">
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        >
          {filters.map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key as any)}
              className={`px-4 py-2 rounded-full mr-2 ${
                filter === f.key 
                  ? 'bg-primary-500' 
                  : 'bg-gray-100'
              }`}
            >
              <Text className={`text-sm font-JakartaSemiBold ${
                filter === f.key ? 'text-white' : 'text-gray-700'
              }`}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Events List */}
      <ScrollView 
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAuditLogs(true)}
            colors={['#A89BB5']}
          />
        }
      >
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#A89BB5" />
          </View>
        ) : events.length === 0 ? (
          <View className="flex-1 justify-center items-center py-20">
            <Image 
              source={icons.history} 
              className="w-16 h-16 mb-4" 
              style={{ tintColor: '#D1D5DB' }}
            />
            <Text className="text-gray-500 font-JakartaMedium">No audit events found</Text>
          </View>
        ) : (
          <>
            <Text className="text-sm text-gray-500 font-JakartaMedium mb-3">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </Text>
            
            {events.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
            
            <View className="h-20" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default AuditLogs;