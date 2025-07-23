import { Image, View, Text, Alert } from "react-native";
import CustomButton from "./CustomButton";
import { icons } from "@/constants";
import { supabase } from "@/lib/supabase";
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { router } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

const OAuth = () => {
    const redirectTo = makeRedirectUri();

    // Listen for URL changes
    useEffect(() => {
        const handleDeepLink = async (url: string) => {
            if (url.includes('#access_token=')) {
                try {
                    await createSessionFromUrl(url);
                    // Force navigation after successful auth
                    router.replace('/(root)/(tabs)/home');
                } catch (error) {
                    console.error('Deep link error:', error);
                }
            }
        };

        // Handle initial URL
        Linking.getInitialURL().then((url) => {
            if (url) handleDeepLink(url);
        });

        // Listen for URL changes
        const subscription = Linking.addEventListener('url', (event) => {
            handleDeepLink(event.url);
        });

        return () => subscription.remove();
    }, []);

    const createSessionFromUrl = async (url: string) => {
        const { params, errorCode } = QueryParams.getQueryParams(url);

        if (errorCode) throw new Error(errorCode);
        const { access_token, refresh_token } = params;

        if (!access_token) return;

        const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        });
        if (error) throw error;
        return data.session;
    };

    const performOAuth = async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                skipBrowserRedirect: true,
            },
        });
        if (error) throw error;

        const res = await WebBrowser.openAuthSessionAsync(
            data?.url ?? '',
            redirectTo
        );

        if (res.type === 'success') {
            const { url } = res;
            await createSessionFromUrl(url);
            // Navigate immediately after setting session
            router.replace('/(root)/(tabs)/home');
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            await performOAuth();
        } catch (error: any) {
            Alert.alert('OAuth Error', error.message);
        }
    };

    return (
        <View>
            <View className="flex flex-row justify-center items-center mt-4 gap-x-3">
                <View className="flex-1 h-[1px] bg-general-100"/>
                <Text className="text-lg">Or</Text>
                <View className="flex-1 h-[1px] bg-general-100"/>
            </View>

            <CustomButton
                title="Continue with Google"
                className="mt-5 w-full shadow-none"
                IconLeft={() => (
                    <Image
                        source={icons.google}
                        resizeMode="contain"
                        className="w-5 h-5 mx-2"
                    />
                )}
                bgVariant="outline"
                textVariant="primary"
                onPress={handleGoogleSignIn}
            />
        </View>
    );
};

export default OAuth;