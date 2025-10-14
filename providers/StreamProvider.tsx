// providers/StreamProvider.tsx
import { useAuth } from "@/contexts/AuthContext";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StreamChat, UserResponse } from "stream-chat";
import { supabase } from "@/lib/supabase";
import { OverlayProvider, Chat } from "stream-chat-expo";

const STREAM_API_KEY = process.env.EXPO_PUBLIC_STREAM_KEY!;
const API_URL = process.env.EXPO_PUBLIC_API_URL!;

// Create client instance
declare global {
  var __STREAM_CLIENT__: StreamChat | undefined;
}

const getStreamClient = () => {
  if (globalThis.__STREAM_CLIENT__ == null) {
    globalThis.__STREAM_CLIENT__ = StreamChat.getInstance(STREAM_API_KEY);
  }
  return globalThis.__STREAM_CLIENT__;
}

// Context for accessing the client and connection status
type StreamContext = { 
  client: StreamChat;
  isConnected: boolean;
  isConnecting: boolean;
};

const StreamContext = createContext<StreamContext | null>(null);

export function useStreamClient() {
  const context = useContext(StreamContext);
  if (!context) {
    throw new Error('useStreamClient must be used within StreamProvider');
  }
  return context;
}

// Token provider - fetch token and user ID from backend
async function fetchStreamToken(): Promise<{ token: string; streamUserId: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No Supabase session');

  const url = `${API_URL}/stream-token`;
  //DEBUG---
  console.log('API_URL', process.env.EXPO_PUBLIC_API_URL);
  console.log('Will fetch', `${process.env.EXPO_PUBLIC_API_URL}/stream-token`);

  try {
    const res = await fetch(url, { 
      method: 'POST', 
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Stream token fetch failed (${res.status}) ${text}`);
    }
    
    const data = await res.json();
    return { 
      token: data.token, 
      streamUserId: data.streamUserId 
    };
  } catch (e) {
    console.error('tokenProvider error:', e);
    throw e;
  }
}

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(getStreamClient, []);
  const { user, isSignedIn } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Connect/disconnect on auth changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (isSignedIn && user) {
          // Already connected to the same user
          if (client.userID === user.id) {
            setIsConnected(true);
            return;
          }

          // Connected to a different user, disconnect first
          if (client.userID && client.userID !== user.id) {
            setIsConnecting(true);
            await client.disconnectUser();
          }

          // Connect with the Stream token
          setIsConnecting(true);
          const { token, streamUserId } = await fetchStreamToken();
          
          await client.connectUser(
            { id: streamUserId },
            token
          );
          
          if (!cancelled) {
            setIsConnected(true);
            setIsConnecting(false);
          }
        } else {
          // Not signed in; disconnect
          if (client.userID) {
            await client.disconnectUser();
          }
          setIsConnected(false);
          setIsConnecting(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Stream connect/disconnect error:', e);
          setIsConnected(false);
          setIsConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id, client]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (client.userID) {
        client.disconnectUser().catch(() => {/* no op */});
      }
    };
  }, [client]);

  const contextValue = useMemo(
    () => ({
      client,
      isConnected,
      isConnecting
    }),
    [client, isConnected, isConnecting]
  );

  return (
    <StreamContext.Provider value={contextValue}>
      <OverlayProvider>
        <Chat client={client}>
          {children}
        </Chat>
      </OverlayProvider>
    </StreamContext.Provider>
  );
}