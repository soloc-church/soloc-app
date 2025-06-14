import { SafeAreaView } from "react-native-safe-area-context"
import {Text, View, ScrollView} from "react-native"
import CustomButton from "@/components/CustomButton"
import InputField from "@/components/InputField"
import { icons } from "@/constants"
import { useState } from "react"
import {Link} from 'expo-router'
import OAuth from "@/components/OAuth"
const SignIn = () => {
    const [form, setForm] = useState({
        email: '',
        password:'',

    });

    const onSignInPress = async () => {}

    return (
        <ScrollView className="flex-1 bg-white">
            {/**Main Text */}
            <View className="flex justified-center">
                <View className="relative w-full h-[250px]">
                    {/**Image Background */}


                    {/**Main Text */}
                    <Text className="text-black text-2xl font-JakartaBold">Let's Get Started</Text>
                </View>

                {/** Input fields */}
                <View className="p-5">
                    {/**Email Input field */}
                    <InputField
                        label="Email"
                        placeholder="Enter your email"
                        icon={icons.email}
                        value={form.email}
                        onChangeText={(value) => setForm({... form, email: value})}
                    />
                    {/**Password input field */}
                    <InputField
                        label="Password"
                        placeholder="Enter your password"
                        icon={icons.lock}
                        secureTextEntry={true}
                        value={form.password}
                        onChangeText={(value) => setForm({... form, password: value})}
                    />

                    {/**Sign Up Button */}
                    <CustomButton 
                        title="Sign up"
                        onPress={onSignInPress}
                        className="mt-6"
                    />

                    {/**OAuth */}
                    <OAuth/>
                    {/* Don't have an account? */}
                    <Link 
                        href="/sign-up"
                        className="text-lg text-center text-general-200 mt-10"
                    >
                        <Text> Don't have an account?</Text>
                        <Text className="text-primary-500"> Log In</Text>
                    </Link>
                </View>
            </View>
        </ScrollView>


    )
}

export default SignIn;