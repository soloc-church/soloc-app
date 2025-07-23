import { Stack } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";

const RootLayout = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#A89BB5" />
            </View>
        );
    }

    if (!user) {
        return <Redirect href="/(auth)/welcome" />;
    }

    return (
        <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
    );
};

export default RootLayout;