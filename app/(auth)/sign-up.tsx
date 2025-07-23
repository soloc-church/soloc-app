import { SafeAreaView } from "react-native-safe-area-context"
import { Text, View, ScrollView, Alert } from "react-native"
import CustomButton from "@/components/CustomButton"
import InputField from "@/components/InputField"
import { icons } from "@/constants"
import { useState } from "react"
import { Link, router } from 'expo-router'
import OAuth from "@/components/OAuth"
import { useAuth } from "@/contexts/AuthContext"

const SignUp = () => {
    const { signUp } = useAuth();
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);

    const onSignUpPress = async () => {
        if (!form.email || !form.password || !form.name) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        const { error } = await signUp(form.email, form.password, form.name);
        
        if (error) {
            Alert.alert('Sign Up Error', error.message);
        } else {
            Alert.alert(
                'Check your email',
                'We sent you a confirmation link. Please check your email to verify your account.',
                [{ text: 'OK', onPress: () => router.push('/(auth)/sign-in') }]
            );
        }
        setLoading(false);
    };

    return (
        <ScrollView className="flex-1 bg-white">
            <View className="flex justify-center">
                <View className="relative w-full h-[250px] justify-center items-center">
                    <Text className="text-black text-2xl font-JakartaBold">Create Your Account</Text>
                </View>

                <View className="p-5">
                    <InputField
                        label="Full Name"
                        placeholder="Enter your full name"
                        icon={icons.person}
                        value={form.name}
                        onChangeText={(value) => setForm({ ...form, name: value })}
                    />
                    
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
                        title={loading ? "Creating Account..." : "Sign Up"}
                        onPress={onSignUpPress}
                        className="mt-6"
                        disabled={loading}
                    />

                    <OAuth />

                    <Link 
                        href="/sign-in"
                        className="text-lg text-center text-general-200 mt-10"
                    >
                        <Text>Already have an account? </Text>
                        <Text className="text-primary-500">Sign In</Text>
                    </Link>
                </View>
            </View>
        </ScrollView>
    );
};

export default SignUp;