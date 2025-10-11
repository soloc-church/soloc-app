import { useAuth } from "@/contexts/AuthContext";
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { StreamChat, UserResponse } from "stream-chat";
import { supabase } from "@/lib/supabase";
import { OverlayProvider, Chat } from "stream-chat-expo";

const STREAM_API_KEY = process.env.EXPO_PUBLIC_STREAM_KEY!;
const API_URL = process.env.EXPO_PUBLIC_API_URL!;

// create client instance
declare global {
    var __STREAM_CLIENT__: StreamChat | undefined;
}

const getStreamClient = () => {
  if (globalThis.__STREAM_CLIENT__ == null) {
    globalThis.__STREAM_CLIENT__ = StreamChat.getInstance(STREAM_API_KEY);
  }
  return globalThis.__STREAM_CLIENT__;
}

// context for accessing the client
type Streamctx = { client: StreamChat};
const StreamContext = createContext<Streamctx | null>(null);
export function useStreamClient(): StreamChat {
    const context = useContext(StreamContext);
    if(!context) {
        throw new Error('useStreamClient must be used within StreamProvider');
    }
    return context.client;
}

// token provider
async function tokenProvider(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No Supabase session');

  const url = `${API_URL}/stream-token`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }} );
  } catch (e) {
    console.warn('tokenProvider network error', { url, API_URL, error: String(e) });
    throw e;
  }
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`Stream token fetch failed (${res.status}) ${text}`)
  }
  const { token: streamToken } = await res.json();
  return streamToken as string;
}

interface StreamProviderProps {
    children: React.ReactNode;
}

export function StreamProvider({ children }: { children: React.ReactNode }) {
    const client = useMemo(getStreamClient, []);
    const { user, isSignedIn } = useAuth();

    // connect / disconnect on auth changes
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                if (isSignedIn && user) {
                    // already connected
                    if (client.userID === user.id) return;

                    // connected to a different user, disconnect first
                    if(client.userID && client.userID !== user.id) {
                        await client.disconnectUser();
                    }
                    // Optionally: fetch display fields from the server along with the token.
                    // For simplicity, let the server upsert name/image and just pass id here.
                    await client.connectUser({ id: user.id}, tokenProvider)
                } else {
                    // not signed in; disconnect
                    if(client.userID) await client.disconnectUser();
                }
                
            } catch (e) {
                if(!cancelled){
                    console.error('Stream connect/disconnect error', e);
                }
            }
        }) ();

        return () => {
            cancelled = true;
        }
    }, [isSignedIn, user?.id, client])

    // Unmount cleanup 
    useEffect (() => {
        return () => {
            if(client.userID){
                client.disconnectUser().catch(() => {/**no op */})
            }
        };
    }, [client]);

    return (
        <StreamContext.Provider value={{client }}>
            <OverlayProvider>
                <Chat client={client}>{children}</Chat>
            </OverlayProvider>
        </StreamContext.Provider>
    );
}