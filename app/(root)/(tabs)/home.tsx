// app/(root)/(tabs)/home.tsx
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import CustomButton from "@/components/CustomButton";
import { SignedIn, SignedOut } from "@/components/auth";
import { Link } from "expo-router";

const Home = () => {
    const { user, signOut } = useAuth();

    return (
        <SafeAreaView className="flex-1 bg-white p-5">
            <SignedIn>
                <View className="flex-1 justify-center items-center">
                    <Text className="text-2xl font-JakartaBold mb-4">
                        Welcome, {user?.user_metadata?.full_name || user?.email}!
                    </Text>
                    <Text className="text-lg text-gray-600 mb-8">
                        You are successfully signed in
                    </Text>
                    
                    <CustomButton
                        title="Sign Out"
                        onPress={() => signOut()}
                        bgVariant="danger"
                        className="w-full"
                    />
                </View>
            </SignedIn>
            
            <SignedOut>
                <View className="flex-1 justify-center items-center">
                    <Text className="text-2xl font-JakartaBold mb-4">
                        Welcome to SolocApp
                    </Text>
                    <Link href="/(auth)/sign-in">
                        <Text className="text-primary-500">Sign In</Text>
                    </Link>
                </View>
            </SignedOut>
        </SafeAreaView>
    );
};

export default Home;