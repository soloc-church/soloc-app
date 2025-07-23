import { Redirect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { View, ActivityIndicator } from "react-native";

const Home = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#A89BB5" />
            </View>
        );
    }

    if (user) {
        return <Redirect href="/(root)/(tabs)/home" />;
    }

    return <Redirect href="/(auth)/welcome" />;
};

export default Home;