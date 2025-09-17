// app/_layout.tsx
import {Stack} from 'expo-router';
import * as SplashScreen from "expo-splash-screen";
import "../global.css";
import { useEffect, useState } from 'react';
import {useFonts} from 'expo-font';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

import { OverlayProvider, Chat, useCreateChatClient } from "stream-chat-expo"

const STREAM_KEY = process.env.EXPO_PUBLIC_STREAM_KEY!;

function WithStreamChat({ children }: { children: React.ReactNode }) {
  const { user, isSignedIn, loading } = useAuth();

  // keep token separate from AuthContext for now
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const [display, setDisplay] = useState<{ name?: string; image?: string }>({});

  useEffect(() => {
    let cancelled = false;

    async function getToken() {
      // not signed in → no chat
      if (!isSignedIn || !user) {
        setStreamToken(null);
        setDisplay({});
        return;
      }

      // fetch a server-issued token (Supabase Edge Function or your API)
      // IMPORTANT: never create tokens in the client
      const { data, error } = await supabase.functions.invoke('stream-token', {
        body: { userId: user.id },
      });

      if (cancelled) return;

      if (error) {
        console.warn('stream-token error', error);
        setStreamToken(null);
        return;
      }

      setStreamToken(data?.token ?? null);
      setDisplay({
        name: data?.name ?? (user.user_metadata as any)?.full_name ?? user.email ?? user.id,
        image: data?.image ?? (user.user_metadata as any)?.avatar_url,
      });
    }

    getToken();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id]);

    const chatClient = useCreateChatClient(
    isSignedIn && user && streamToken
      ? {
          apiKey: STREAM_KEY,
          userData: { id: user.id, name: display.name, image: display.image },
          tokenOrProvider: streamToken,
          // closeConnectionOnBackground: true, // optional
        }
      : undefined
  );

  // If user not signed in, just render the app (auth stack, etc.)
  if (!isSignedIn || !user) return <>{children}</>;

  // When signed in but client not ready yet, keep things simple
  if (!chatClient) return null;

  return <Chat client={chatClient}>{children}</Chat>;
}

export default function RootLayout() {
    const [loaded] = useFonts({
        "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
        "Jakarta-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
        "Jakarta-ExtraLight": require("../assets/fonts/PlusJakartaSans-ExtraLight.ttf"),
        "Jakarta-Light": require("../assets/fonts/PlusJakartaSans-Light.ttf"),
        "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
        "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
        "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    });

    useEffect(() => {
        if(loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);
    
    if (!loaded) return null;
    
    return (
        <AuthProvider>
            <OverlayProvider>
                <WithStreamChat>
                    <Stack>
                        <Stack.Screen name="(root)" options={{ headerShown: false}} />
                        <Stack.Screen name="(auth)" options={{ headerShown: false}} />
                        <Stack.Screen name="index" options={{headerShown: false}} />
                        <Stack.Screen name="+not-found" options={{headerShown: false}}/>
                    </Stack>
                </WithStreamChat>
            </OverlayProvider>
        </AuthProvider>
    )
}



