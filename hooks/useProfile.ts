// hooks/useProfile.ts
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileService, Profile } from '@/lib/services/profileService';

type State = {
  loading: boolean;
  data: Profile | null;
  error: Error | null;
};

export function useProfile() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!user?.id) {
        if (!cancelled) setState({ loading: false, data: null, error: null });
        return;
      }

      if (!cancelled) setState(s => ({ ...s, loading: true, error: null }));
      try {
        const data = await ProfileService.getCurrentUserProfile();
        if (!cancelled) setState({ loading: false, data: data ?? null, error: null });
      } catch (e: any) {
        if (!cancelled) setState({ loading: false, data: null, error: e });
      }
    }

    run();
    return () => { cancelled = true; };
  }, [user?.id]);

  const refresh = async () => {
    const data = await ProfileService.getCurrentUserProfile();
    setState({ loading: false, data: data ?? null, error: null });
    return data;
  };

  return {
    profile: state.data,
    isLoading: state.loading,
    error: state.error,
    refresh,
  };
}
