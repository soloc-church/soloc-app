import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { View, ActivityIndicator } from "react-native";

export default function AuthLayout() {
    const { isSignedIn, loading } = useAuth();

    // Show loading state while checking auth
    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#A89BB5" />
            </View>
        );
    }

    // Redirect if already signed in
    if (isSignedIn) {
        return <Redirect href="/(root)/(tabs)/home" />;
    }

    return (
        <Stack>
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="sign-up" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack>
    );
}