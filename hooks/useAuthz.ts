// hooks/useAuthz.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Authz } from '@/types/authz';

export function useAuthz() {
  const [authz, setAuthz] = useState<Authz | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_authz_for_current_user');

      if (!off) {
        setAuthz(error ? null : (data as Authz));
        setLoading(false);
      }
    })();
    return () => { off = true; };
  }, []);

  return { authz, loading };
}
