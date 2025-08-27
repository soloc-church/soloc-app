-- =====================================================
-- COMPREHENSIVE SECURITY & PERFORMANCE MIGRATION
-- Run this after backing up your database
-- =====================================================

-- =====================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =====================================================

-- Enable RLS on capability tables (currently missing)
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextual_role_capabilities ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 2: FIX SECURITY DEFINER FUNCTIONS
-- =====================================================

-- Fix all functions to have explicit search_path
CREATE OR REPLACE FUNCTION public.current_global_role()
RETURNS global_role
LANGUAGE sql 
STABLE 
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT global_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.role_in(VARIADIC p_roles global_role[])
RETURNS BOOLEAN
LANGUAGE sql 
STABLE 
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT current_global_role() = ANY(p_roles);
$$;

CREATE OR REPLACE FUNCTION public.is_group_leader(
  p_group_id UUID, 
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql 
STABLE 
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 
    FROM public.contextual_roles
    WHERE scope_type = 'group_chat'
      AND scope_id = p_group_id
      AND user_id = p_user_id
      AND role_type = 'group_leader'
      AND is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_elevated(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT global_role IN ('elder','pastor','admin')
     FROM public.profiles
     WHERE id = p_uid
     LIMIT 1), 
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 3: FIX PROFILE CREATION TRIGGER
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    email,
    global_role,
    created_at,
    updated_at,
    is_active,
    visibility,
    joined_date
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'global_role')::global_role, 'guest'),
    NOW(),
    NOW(),
    true,
    jsonb_build_object(
      'phone', 'private',
      'birthday', 'private', 
      'address', 'private',
      'email', 'pastoral'
    ),
    CURRENT_DATE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- STEP 4: RLS POLICIES FOR CAPABILITY TABLES (IMPROVED)
-- =====================================================

-- Drop any existing policies
DROP POLICY IF EXISTS "Capabilities are read-only" ON public.capabilities;
DROP POLICY IF EXISTS "Global role capabilities are read-only" ON public.global_role_capabilities;
DROP POLICY IF EXISTS "Contextual role capabilities are read-only" ON public.contextual_role_capabilities;

-- Capabilities table: read-only for authenticated users
CREATE POLICY "capabilities_read"
  ON public.capabilities
  FOR SELECT
  TO authenticated
  USING (true);

-- Global role capabilities: read-only for authenticated users
CREATE POLICY "global_role_caps_read"
  ON public.global_role_capabilities
  FOR SELECT
  TO authenticated
  USING (true);

-- Contextual role capabilities: read-only for authenticated users
CREATE POLICY "contextual_role_caps_read"
  ON public.contextual_role_capabilities
  FOR SELECT
  TO authenticated
  USING (true);

-- Prevent any modifications from client
CREATE POLICY "capabilities_no_modify"
  ON public.capabilities
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "global_role_caps_no_modify"
  ON public.global_role_capabilities
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "contextual_role_caps_no_modify"
  ON public.contextual_role_capabilities
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- =====================================================
-- STEP 5: FIX GRANTS (IMPROVED PRINCIPLE OF LEAST PRIVILEGE)
-- =====================================================

-- Revoke all dangerous broad grants
REVOKE ALL ON public.capabilities FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.global_role_capabilities FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.contextual_role_capabilities FROM anon, authenticated, PUBLIC;
REVOKE DELETE ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE UPDATE, DELETE, INSERT ON public.role_events FROM anon, authenticated, PUBLIC;

-- Grant only necessary SELECT permissions for capabilities (read-only reference data)
GRANT SELECT ON public.capabilities TO authenticated;
GRANT SELECT ON public.global_role_capabilities TO authenticated;
GRANT SELECT ON public.contextual_role_capabilities TO authenticated;

-- Profiles: authenticated can SELECT and UPDATE their own (RLS will enforce)
GRANT SELECT, UPDATE, INSERT ON public.profiles TO authenticated;

-- Role events: only SELECT for authenticated (insertions via RPCs only)
GRANT SELECT ON public.role_events TO authenticated;

-- Remove direct view access (if it exists)
REVOKE ALL ON public.v_profiles FROM authenticated, anon, PUBLIC;

-- =====================================================
-- STEP 6: ADD MISSING INDEXES (IMPROVED)
-- =====================================================

-- Text search indexes using trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Use GIN indexes for text search
CREATE INDEX IF NOT EXISTS idx_profiles_fullname_trgm 
  ON public.profiles USING gin (full_name gin_trgm_ops)
  WHERE full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm 
  ON public.profiles USING gin (email gin_trgm_ops)
  WHERE email IS NOT NULL;

-- Foreign key and filtering indexes
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_chat 
  ON public.group_memberships(group_chat_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_group_memberships_user 
  ON public.group_memberships(user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_role_events_target 
  ON public.role_events(target_id);

CREATE INDEX IF NOT EXISTS idx_role_events_actor 
  ON public.role_events(actor_id);

CREATE INDEX IF NOT EXISTS idx_role_events_timestamp_desc
  ON public.role_events(timestamp DESC);

-- Partial index for active profiles (common filter)
CREATE INDEX IF NOT EXISTS idx_profiles_active 
  ON public.profiles(is_active) 
  WHERE is_active = true;

-- Composite index for contextual roles lookups
CREATE INDEX IF NOT EXISTS idx_contextual_roles_composite
  ON public.contextual_roles(user_id, scope_type, scope_id)
  WHERE is_active = true;

-- =====================================================
-- STEP 7: [REMOVED - Batch operations moved to separate migration]
-- =====================================================

-- =====================================================
-- STEP 8: ADMIN STATS RPC (IMPROVED WITH BETTER SECURITY)
-- =====================================================

DROP FUNCTION IF EXISTS public.get_admin_stats();

CREATE FUNCTION public.get_admin_stats()
RETURNS TABLE(
  totalMembers INT,
  activeMembers INT,
  totalMinistries INT,
  totalGroups INT,
  pendingRequests INT,
  recentActivity INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  -- Check authorization first
  IF NOT is_elevated() THEN
    RAISE EXCEPTION 'Not authorized to view admin stats';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INT FROM public.profiles) AS totalMembers,
    (SELECT COUNT(*)::INT FROM public.profiles WHERE is_active = true) AS activeMembers,
    (SELECT COUNT(*)::INT FROM public.ministries WHERE is_active = true) AS totalMinistries,
    (SELECT COUNT(*)::INT FROM public.group_chats WHERE is_active = true) AS totalGroups,
    (SELECT COUNT(*)::INT FROM public.join_requests WHERE status = 'pending') AS pendingRequests,
    (SELECT COUNT(*)::INT FROM public.role_events 
     WHERE "timestamp" >= NOW() - INTERVAL '7 days') AS recentActivity;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

-- =====================================================
-- STEP 9: IMPROVED LIST_ROLE_EVENTS WITH PROPER JOINS
-- =====================================================

DROP FUNCTION IF EXISTS public.list_role_events(UUID, INT);

CREATE FUNCTION public.list_role_events(
  p_target UUID DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE(
  id UUID,
  actor_id UUID,
  actor_full_name TEXT,
  target_id UUID,
  target_full_name TEXT,
  role_assigned TEXT,
  action TEXT,
  scope_type TEXT,
  scope_id UUID,
  reason TEXT,
  event_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  -- Check authorization
  IF NOT is_elevated() THEN
    -- Non-elevated users can only see their own events
    RETURN QUERY
    SELECT 
      e.id,
      e.actor_id,
      a.full_name AS actor_full_name,
      e.target_id,
      t.full_name AS target_full_name,
      e.role_assigned,
      e.action::TEXT,
      e.scope_type::TEXT,
      e.scope_id,
      e.reason,
      e.event_at
    FROM public.role_events e
    LEFT JOIN public.profiles a ON a.id = e.actor_id
    LEFT JOIN public.profiles t ON t.id = e.target_id
    WHERE (e.target_id = auth.uid() OR e.actor_id = auth.uid())
      AND (p_target IS NULL OR e.target_id = p_target)
    ORDER BY e.event_at DESC
    LIMIT p_limit;
  ELSE
    -- Elevated users can see all events
    RETURN QUERY
    SELECT 
      e.id,
      e.actor_id,
      a.full_name AS actor_full_name,
      e.target_id,
      t.full_name AS target_full_name,
      e.role_assigned,
      e.action::TEXT,
      e.scope_type::TEXT,
      e.scope_id,
      e.reason,
      e.event_at
    FROM public.role_events e
    LEFT JOIN public.profiles a ON a.id = e.actor_id
    LEFT JOIN public.profiles t ON t.id = e.target_id
    WHERE (p_target IS NULL OR e.target_id = p_target)
    ORDER BY e.event_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_role_events(UUID, INT) TO authenticated;

-- =====================================================
-- STEP 10: REPLACE VIEW WITH SECURE RPCs
-- =====================================================

-- Drop the view entirely (safer than keeping it)
DROP VIEW IF EXISTS public.v_profiles CASCADE;

-- Create RPC for getting a single profile with privacy masking
CREATE OR REPLACE FUNCTION public.get_profile_masked(p_target uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone text,
  email text,
  birthday date,
  address text,
  joined_date date,
  profile_image_url text,
  global_role public.global_role,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public','pg_temp'
AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid
  )
  SELECT
    p.id,
    p.full_name,
    CASE
      WHEN p.id = (SELECT uid FROM viewer) THEN p.phone
      WHEN p.visibility->>'phone' = 'public' THEN p.phone
      WHEN p.visibility->>'phone' = 'members'  AND public.role_in('member','elder','pastor','admin') THEN p.phone
      WHEN p.visibility->>'phone' = 'leaders'  AND public.role_in('elder','pastor','admin') THEN p.phone
      WHEN p.visibility->>'phone' = 'pastoral' AND public.role_in('pastor','admin') THEN p.phone
      ELSE NULL
    END AS phone,
    CASE
      WHEN p.id = (SELECT uid FROM viewer) THEN p.email
      WHEN p.visibility->>'email' = 'leaders'  AND public.role_in('elder','pastor','admin') THEN p.email
      WHEN p.visibility->>'email' = 'pastoral' AND public.role_in('pastor','admin') THEN p.email
      ELSE NULL
    END AS email,
    CASE
      WHEN p.id = (SELECT uid FROM viewer) THEN p.birthday
      WHEN p.visibility->>'birthday' = 'public' THEN p.birthday
      WHEN p.visibility->>'birthday' = 'members'  AND public.role_in('member','elder','pastor','admin') THEN p.birthday
      WHEN p.visibility->>'birthday' = 'leaders'  AND public.role_in('elder','pastor','admin') THEN p.birthday
      WHEN p.visibility->>'birthday' = 'pastoral' AND public.role_in('pastor','admin') THEN p.birthday
      ELSE NULL
    END AS birthday,
    CASE
      WHEN p.id = (SELECT uid FROM viewer) THEN p.address
      WHEN p.visibility->>'address' = 'public' THEN p.address
      WHEN p.visibility->>'address' = 'members'  AND public.role_in('member','elder','pastor','admin') THEN p.address
      WHEN p.visibility->>'address' = 'leaders'  AND public.role_in('elder','pastor','admin') THEN p.address
      WHEN p.visibility->>'address' = 'pastoral' AND public.role_in('pastor','admin') THEN p.address
      ELSE NULL
    END AS address,
    p.joined_date,
    p.profile_image_url,
    CASE WHEN public.is_elevated() THEN p.global_role ELSE NULL END AS global_role,
    p.is_active
  FROM public.profiles p
  WHERE p.id = p_target
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_profile_masked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_masked(uuid) TO authenticated, service_role;

-- Create privacy-aware search RPC (prevents enumeration)
CREATE OR REPLACE FUNCTION public.search_profiles_masked(p_query text, p_limit int DEFAULT 25)
RETURNS TABLE(
  id uuid,
  full_name text,
  profile_image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  -- Prevent enumeration with minimum query length
  IF p_query IS NULL OR length(btrim(p_query)) < 3 THEN
    RAISE EXCEPTION 'Query too short (minimum 3 characters)';
  END IF;

  IF public.is_elevated() THEN
    -- Staff can search all active members
    RETURN QUERY
      SELECT p.id, p.full_name, p.profile_image_url
      FROM public.profiles p
      WHERE p.is_active
        AND (p.full_name ILIKE '%'||p_query||'%' OR p.email ILIKE p_query||'%')
      ORDER BY p.full_name
      LIMIT GREATEST(1, LEAST(p_limit, 100));
  ELSE
    -- Regular members can only find people in their groups
    RETURN QUERY
      SELECT DISTINCT p.id, p.full_name, p.profile_image_url
      FROM public.profiles p
      WHERE p.is_active 
        AND (p.full_name ILIKE '%'||p_query||'%' OR p.email ILIKE p_query||'%')
        AND EXISTS (
          SELECT 1
          FROM public.group_memberships gm_self
          JOIN public.group_memberships gm_other
            ON gm_self.group_chat_id = gm_other.group_chat_id
          WHERE gm_self.user_id = auth.uid()
            AND gm_other.user_id = p.id
            AND gm_self.is_active AND gm_other.is_active
        )
      ORDER BY p.full_name
      LIMIT GREATEST(1, LEAST(p_limit, 50));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.search_profiles_masked(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_masked(text,int) TO authenticated, service_role;

-- =====================================================
-- CLEANUP: Remove duplicate or conflicting RLS policies
-- =====================================================

-- Drop old/conflicting policies if they exist
DROP POLICY IF EXISTS "self_manage_profile" ON public.profiles;
DROP POLICY IF EXISTS "self_update_profile" ON public.profiles;
DROP POLICY IF EXISTS "elevated_manage_profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_elevated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_manage_elevated" ON public.profiles;

-- Create clean, non-overlapping RLS policies for profiles
CREATE POLICY "profiles_select_self"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_staff"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (is_elevated() AND id != auth.uid());

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_manage_staff"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (is_elevated() AND id != auth.uid())
  WITH CHECK (is_elevated() AND id != auth.uid());

-- =====================================================
-- FINAL: Grant execution permissions for helper functions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.current_global_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_in(VARIADIC global_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_leader(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_elevated(UUID) TO authenticated;