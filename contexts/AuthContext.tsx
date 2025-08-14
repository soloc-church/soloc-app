import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import * as Linking from 'expo-linking'

interface AuthContextType {
  user: User | null
  session: Session | null
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  loading: boolean
  isSignedIn: boolean
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    // Handle deep links for email confirmation
    const handleDeepLink = (url: string) => {
      if (url?.includes('access_token=')) {
        // The auth state change listener will handle the session update
        // Just close the modal/browser if needed
      }
    }

    // Get initial URL
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url)
    })

    // Listen for URL changes
    const urlSubscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url)
    })

    return () => {
      subscription.unsubscribe()
      urlSubscription.remove()
    }
  }, [])

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: 'solocapp://auth/callback',
      },
    })

    // if signup successful ensure profile exists
    if(!error && data.user && !data.session) {
      // user needs to confirm email
      return {error};
    }

    if(!error && data.user && data.session) {
      //check if profile was created by trigger
      const {data: profile} = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if(!profile) {
        // manually create profile if trigger failed
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            email: email,
            global_role: 'guest',
            is_active: true,
            joined_date: new Date().toISOString().split('T')[0]
          });
      }
    }

    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        signUp,
        signIn,
        signOut,
        loading,
        isSignedIn: !!session,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}