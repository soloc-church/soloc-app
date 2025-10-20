// app/(root)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { View, Image, ImageSourcePropType, TouchableOpacity, Text } from "react-native";
import { icons } from "@/constants";
import { useAuthz } from "@/hooks/useAuthz";
import { can } from "@/lib/rbac/permissions";
import { router } from "expo-router";
import { useStreamClient } from "@/providers/StreamProvider";
import { useState, useEffect } from "react";

const TabIcon = ({ source, focused }: { source: ImageSourcePropType; focused: boolean }) => (
  <View
    className={`items-center justify-center rounded-full w-12 h-12 ${
      focused ? "bg-primary-600 shadow-lg" : "bg-transparent"
    }`}
  >
    <Image
      source={source}
      resizeMode="contain"
      className="w-7 h-7"
      tintColor={focused ? "white" : "#9ca3af"}
    />
  </View>
);

const MessageButton = () => {
  const { client, isConnected } = useStreamClient();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isConnected || !client) return;

    // Get initial unread count
    const getUnreadCount = async () => {
      try {
        const { total_unread_count } = await client.getUnreadCount();
        setUnreadCount(total_unread_count);
      } catch (error) {
        console.error('Error getting unread count:', error);
      }
    };

    getUnreadCount();

    // Listen for unread count changes
    const handleEvent = (event: any) => {
      if (event.total_unread_count !== undefined) {
        setUnreadCount(event.total_unread_count);
      }
    };

    client.on('notification.mark_read', handleEvent);
    client.on('message.new', handleEvent);

    return () => {
      client.off('notification.mark_read', handleEvent);
      client.off('message.new', handleEvent);
    };
  }, [client, isConnected]);

  return (
    <TouchableOpacity
      onPress={() => router.push('/(root)/messages')}
      className="mr-4 relative"
    >
      <Image
        source={icons.chat}
        className="w-6 h-6"
        style={{ tintColor: '#4B5563' }}
      />
      {unreadCount > 0 && (
        <View className="absolute -top-2 -right-2 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
          <Text className="text-white text-xs font-JakartaBold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const Layout = () => {
  const { authz, loading } = useAuthz();
  const showAdmin = !loading && can.openAdminPanel(authz);

  return (
    <>
      <Tabs
        initialRouteName="home/index"
        screenOptions={{
          tabBarShowLabel: false,
          tabBarStyle: {
            borderTopWidth: 0,
            elevation: 0,
            backgroundColor: "#ffffffee",
            height: 70,
            position: "absolute",
            bottom: 12,
            left: 16,
            right: 16,
            borderRadius: 20,
            paddingBottom: 10,
          },
          headerRight: () => <MessageButton />,
          headerStyle: {
            backgroundColor: '#FFFFFF',
            shadowColor: 'transparent',
            elevation: 0,
          },
          headerTitleStyle: {
            fontFamily: 'Jakarta-SemiBold',
            fontSize: 18,
          },
        }}
      >
        <Tabs.Screen
          name="home/index"
          options={{
            title: "Home",
            headerShown: true,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.home} />,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: "Groups",
            headerShown: true,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.list} />,
          }}
        />
        <Tabs.Screen
          name="news/index"
          options={{
            title: "News",
            headerShown: true,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.newspaper} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: "Admin",
            headerShown: true,
            href: showAdmin ? undefined : null,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.lock} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerShown: true,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.profile} />,
          }}
        />
      </Tabs>
    </>
  );
};

export default Layout;
