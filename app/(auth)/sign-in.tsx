import { SafeAreaView } from "react-native-safe-area-context"
import { Text, View, ScrollView, Alert } from "react-native"
import CustomButton from "@/components/CustomButton"
import InputField from "@/components/InputField"
import { icons } from "@/constants"
import { useState } from "react"
import { Link, router } from 'expo-router'
import OAuth from "@/components/OAuth"
import { useAuth } from "@/contexts/AuthContext"

const SignIn = () => {
    const { signIn } = useAuth();
    const [form, setForm] = useState({
        email: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);

    const onSignInPress = async () => {
        if (!form.email || !form.password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        const { error } = await signIn(form.email, form.password);
        
        if (error) {
            Alert.alert('Sign In Error', error.message);
        } else {
            router.replace('/(root)/(tabs)/home');
        }
        setLoading(false);
    };

    return (
        <ScrollView className="flex-1 bg-white">
            <View className="flex justify-center">
                <View className="relative w-full h-[250px] justify-center items-center">
                    <Text className="text-black text-2xl font-JakartaBold">Welcome Back</Text>
                </View>

                <View className="p-5">
                    <InputField
                        label="Email"
                        placeholder="Enter your email"
                        icon={icons.email}
                        value={form.email}
                        onChangeText={(value) => setForm({ ...form, email: value })}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    
                    <InputField
                        label="Password"
                        placeholder="Enter your password"
                        icon={icons.lock}
                        secureTextEntry={true}
                        value={form.password}
                        onChangeText={(value) => setForm({ ...form, password: value })}
                    />

                    <CustomButton 
                        title={loading ? "Signing In..." : "Sign In"}
                        onPress={onSignInPress}
                        className="mt-6"
                        disabled={loading}
                    />

                    <OAuth />

                    <Link 
                        href="/sign-up"
                        className="text-lg text-center text-general-200 mt-10"
                    >
                        <Text>Don't have an account? </Text>
                        <Text className="text-primary-500">Sign Up</Text>
                    </Link>
                </View>
            </View>
        </ScrollView>
    );
};

export default SignIn;