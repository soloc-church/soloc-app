// app/(root)/(tabs)/admin/_layout.tsx
import { Stack, Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuthz } from "@/hooks/useAuthz";
import { can } from "@/lib/rbac/permissions";

export default function AdminStack() {
  const { authz, loading } = useAuthz();

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#A89BB5" />
      </View>
    );
  }

  if (!can.openAdminPanel(authz)) {
    return <Redirect href="/(root)/(tabs)/home" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: "Admin Dashboard" }} />
      <Stack.Screen name="members" options={{ title: "Member Management" }} />
      <Stack.Screen name="roles" options={{ title: "Role Management" }} />
      <Stack.Screen name="ministries" options={{ title: "Ministry Management" }} />
      <Stack.Screen name="audit" options={{ title: "Audit Logs" }} />
      <Stack.Screen name="member-detail" options={{ title: "Member Details" }} />
    </Stack>
  );
}
