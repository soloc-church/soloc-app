-- Migration to fix RLS and security issues
-- Run this after backing up your database

-- =====================================================
-- STEP 1: DROP EXISTING POLICIES (to replace them)
-- =====================================================
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
DROP POLICY IF EXISTS "Logged-in users can see other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Elevated roles can manage any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage own family links" ON public.family_relationships;
DROP POLICY IF EXISTS "Elevated roles can view all family links" ON public.family_relationships;
DROP POLICY IF EXISTS "Users can see groups based on visibility" ON public.group_chats;
DROP POLICY IF EXISTS "Elders and above can create groups" ON public.group_chats;
DROP POLICY IF EXISTS "Leaders or elevated roles can update groups" ON public.group_chats;
DROP POLICY IF EXISTS "Leaders or elevated roles can delete groups" ON public.group_chats;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "Members can see other members of their groups" ON public.group_memberships;
DROP POLICY IF EXISTS "Leaders can manage memberships in their groups" ON public.group_memberships;
DROP POLICY IF EXISTS "Users can manage their own join requests" ON public.join_requests;
DROP POLICY IF EXISTS "Leaders can see and process requests for their group" ON public.join_requests;
DROP POLICY IF EXISTS "Elevated roles can manage core structures" ON public.ministries;
DROP POLICY IF EXISTS "Elevated roles can manage teams" ON public.teams;
DROP POLICY IF EXISTS "Elevated roles can manage roles" ON public.contextual_roles;
DROP POLICY IF EXISTS "Elevated roles can view audit events" ON public.role_events;
DROP POLICY IF EXISTS "Elevated roles can manage inactive archive" ON public.inactive_members;

-- Also drop any policies with new names in case of retry
DROP POLICY IF EXISTS self_manage_profile ON public.profiles;
DROP POLICY IF EXISTS self_update_profile ON public.profiles;
DROP POLICY IF EXISTS elevated_manage_profile ON public.profiles;
DROP POLICY IF EXISTS family_self ON public.family_relationships;
DROP POLICY IF EXISTS family_elevated ON public.family_relationships;
DROP POLICY IF EXISTS ministry_read ON public.ministries;
DROP POLICY IF EXISTS ministry_insert ON public.ministries;
DROP POLICY IF EXISTS ministry_update ON public.ministries;
DROP POLICY IF EXISTS ministry_delete ON public.ministries;
DROP POLICY IF EXISTS team_read ON public.teams;
DROP POLICY IF EXISTS team_insert ON public.teams;
DROP POLICY IF EXISTS team_update ON public.teams;
DROP POLICY IF EXISTS team_delete ON public.teams;
DROP POLICY IF EXISTS chat_visibility ON public.group_chats;
DROP POLICY IF EXISTS chat_create_elder ON public.group_chats;
DROP POLICY IF EXISTS chat_leader_manage ON public.group_chats; -- Old multi-command policy name
DROP POLICY IF EXISTS chat_leader_update ON public.group_chats; -- New split policy name
DROP POLICY IF EXISTS chat_leader_delete ON public.group_chats; -- New split policy name
DROP POLICY IF EXISTS membership_self_view ON public.group_memberships;
DROP POLICY IF EXISTS membership_group_member ON public.group_memberships;
DROP POLICY IF EXISTS membership_leader ON public.group_memberships;
DROP POLICY IF EXISTS join_self ON public.join_requests;
DROP POLICY IF EXISTS join_leader ON public.join_requests; -- Old multi-command policy name
DROP POLICY IF EXISTS join_leader_read ON public.join_requests; -- New split policy name
DROP POLICY IF EXISTS join_leader_update ON public.join_requests; -- New split policy name
DROP POLICY IF EXISTS contextual_leader_manage ON public.contextual_roles;
DROP POLICY IF EXISTS role_events_insert ON public.role_events;
DROP POLICY IF EXISTS role_events_read ON public.role_events;
DROP POLICY IF EXISTS inactive_read ON public.inactive_members;
DROP POLICY IF EXISTS inactive_manage ON public.inactive_members;

-- =====================================================
-- STEP 2: CREATE IMPROVED HELPER FUNCTIONS
-- =====================================================

-- Drop old functions first
DROP FUNCTION IF EXISTS public.get_my_global_role();
DROP FUNCTION IF EXISTS public.has_elevated_role(UUID);
DROP FUNCTION IF EXISTS public.is_group_leader(UUID, UUID);

-- Create new, more efficient helper functions
CREATE OR REPLACE FUNCTION public.current_global_role()
RETURNS global_role
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT global_role
  FROM   public.profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

-- Check if caller's global_role is in supplied list
CREATE OR REPLACE FUNCTION public.role_in( VARIADIC p_roles global_role[] )
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT current_global_role() = ANY(p_roles);
$$;

-- Determine if caller is a contextual leader of a given group
CREATE OR REPLACE FUNCTION public.is_group_leader(
  p_group_id UUID, p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT TRUE
  FROM   public.contextual_roles
  WHERE  scope_type = 'group_chat'
    AND  scope_id   = p_group_id
    AND  user_id    = p_user_id
    AND  role_type  = 'group_leader'
    AND  is_active  IS TRUE
  LIMIT 1;
$$;

-- Convenience: "elevated" means elder+ (elder, pastor, admin)
CREATE OR REPLACE FUNCTION public.is_elevated( p_uid UUID DEFAULT auth.uid() )
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT global_role IN ('elder','pastor','admin')
  FROM   public.profiles
  WHERE  id = p_uid
  LIMIT 1;
$$;

-- =====================================================
-- STEP 3: ADD MISSING COLUMN (email) TO PROFILES
-- =====================================================

-- Add email column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
AND p.email IS NULL;

-- =====================================================
-- STEP 4: CREATE REDACTED VIEW FOR PROFILES
-- =====================================================

DROP VIEW IF EXISTS public.v_profiles CASCADE;

CREATE VIEW public.v_profiles
AS
SELECT
  p.id,
  p.full_name,
  /* Phone visibility based on role and settings */
  CASE
    WHEN p.id = auth.uid()                                THEN p.phone
    WHEN NOT role_in('member','elder','pastor','admin')   THEN NULL
    WHEN p.visibility ->> 'phone'   = 'public'            THEN p.phone
    WHEN p.visibility ->> 'phone'   = 'members'           AND role_in('member','elder','pastor','admin') THEN p.phone
    WHEN p.visibility ->> 'phone'   = 'leaders'           AND role_in('elder','pastor','admin')          THEN p.phone
    WHEN p.visibility ->> 'phone'   = 'pastoral'          AND role_in('pastor','admin')                   THEN p.phone
    ELSE NULL
  END AS phone,
  /* Email visibility - more restricted */
  CASE
    WHEN p.id = auth.uid() THEN p.email
    WHEN p.visibility ->> 'email' = 'leaders' AND role_in('elder','pastor','admin') THEN p.email
    WHEN p.visibility ->> 'email' = 'pastoral' AND role_in('pastor','admin') THEN p.email
    ELSE NULL
  END AS email,
  /* Birthday visibility */
  CASE
    WHEN p.id = auth.uid()                                THEN p.birthday
    WHEN p.visibility ->> 'birthday' = 'public'           THEN p.birthday
    WHEN p.visibility ->> 'birthday' = 'members'          AND role_in('member','elder','pastor','admin') THEN p.birthday
    WHEN p.visibility ->> 'birthday' = 'leaders'          AND role_in('elder','pastor','admin')          THEN p.birthday
    WHEN p.visibility ->> 'birthday' = 'pastoral'         AND role_in('pastor','admin')                   THEN p.birthday
    ELSE NULL
  END AS birthday,
  /* Address visibility */
  CASE
    WHEN p.id = auth.uid()                                THEN p.address
    WHEN p.visibility ->> 'address' = 'public'            THEN p.address
    WHEN p.visibility ->> 'address' = 'members'           AND role_in('member','elder','pastor','admin') THEN p.address
    WHEN p.visibility ->> 'address' = 'leaders'           AND role_in('elder','pastor','admin')          THEN p.address
    WHEN p.visibility ->> 'address' = 'pastoral'          AND role_in('pastor','admin')                   THEN p.address
    ELSE NULL
  END AS address,
  p.joined_date,
  p.profile_image_url,
  /* Only show role to elders+ */
  CASE
    WHEN is_elevated() THEN p.global_role
    ELSE NULL
  END AS global_role,
  p.is_active
FROM public.profiles p
WHERE
      p.id            = auth.uid()                        -- always see yourself
   OR role_in('member','elder','pastor','admin');         -- directory access

COMMENT ON VIEW public.v_profiles IS
'Profiles view that enforces per-field visibility.  
 Query this instead of the base table outside admin contexts.';

-- =====================================================
-- STEP 5: CREATE NEW RLS POLICIES
-- =====================================================

-- PROFILES POLICIES
CREATE POLICY self_manage_profile
  ON public.profiles
  FOR SELECT
  USING ( id = auth.uid() );

CREATE POLICY self_update_profile  
  ON public.profiles
  FOR UPDATE
  USING      ( id = auth.uid() )
  WITH CHECK ( id = auth.uid() );

CREATE POLICY elevated_manage_profile
  ON public.profiles
  FOR ALL
  USING ( is_elevated() );

-- FAMILY RELATIONSHIPS POLICIES
CREATE POLICY family_self
  ON public.family_relationships
  FOR ALL
  USING      ( user_id_1 = auth.uid() )
  WITH CHECK ( user_id_1 = auth.uid() );

CREATE POLICY family_elevated
  ON public.family_relationships
  FOR SELECT
  USING ( is_elevated() );

-- MINISTRIES POLICIES
CREATE POLICY ministry_read
  ON public.ministries
  FOR SELECT
  USING ( role_in('member','elder','pastor','admin') );

CREATE POLICY ministry_insert
  ON public.ministries
  FOR INSERT
  WITH CHECK ( role_in('elder','pastor','admin') );

CREATE POLICY ministry_update
  ON public.ministries
  FOR UPDATE
  USING ( role_in('elder','pastor','admin') )
  WITH CHECK ( role_in('elder','pastor','admin') );

CREATE POLICY ministry_delete
  ON public.ministries
  FOR DELETE
  USING ( role_in('elder','pastor','admin') );

-- TEAMS POLICIES
CREATE POLICY team_read
  ON public.teams
  FOR SELECT
  USING ( role_in('member','elder','pastor','admin') );

CREATE POLICY team_insert
  ON public.teams
  FOR INSERT
  WITH CHECK ( role_in('elder','pastor','admin') );

CREATE POLICY team_update
  ON public.teams
  FOR UPDATE
  USING ( role_in('elder','pastor','admin') )
  WITH CHECK ( role_in('elder','pastor','admin') );

CREATE POLICY team_delete
  ON public.teams
  FOR DELETE
  USING ( role_in('elder','pastor','admin') );

-- GROUP CHATS POLICIES
CREATE POLICY chat_visibility
  ON public.group_chats
  FOR SELECT
  USING (
       visibility = 'public'
    OR (visibility = 'members' AND role_in('member','elder','pastor','admin'))
    OR (visibility = 'request' AND (
           EXISTS ( SELECT 1
                    FROM public.group_memberships gm
                    WHERE gm.group_chat_id = group_chats.id
                      AND gm.user_id       = auth.uid() )
        ) )
    OR is_group_leader(group_chats.id)
    OR is_elevated()
  );

CREATE POLICY chat_create_elder
  ON public.group_chats
  FOR INSERT
  WITH CHECK ( role_in('elder','pastor','admin') );

-- FIXED: Split multi-command policy 'chat_leader_manage' into two separate policies.
CREATE POLICY chat_leader_update
  ON public.group_chats
  FOR UPDATE
  USING (
       is_group_leader(group_chats.id)
    OR is_elevated()
  )
  WITH CHECK (
       is_group_leader(group_chats.id)
    OR is_elevated()
  );

CREATE POLICY chat_leader_delete
  ON public.group_chats
  FOR DELETE
  USING (
       is_group_leader(group_chats.id)
    OR is_elevated()
  );

-- GROUP MEMBERSHIPS POLICIES
CREATE POLICY membership_self_view
  ON public.group_memberships
  FOR SELECT
  USING ( user_id = auth.uid() );

CREATE POLICY membership_group_member
  ON public.group_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_memberships gm
      WHERE gm.group_chat_id = group_memberships.group_chat_id
        AND gm.user_id       = auth.uid()
    )
  );

CREATE POLICY membership_leader
  ON public.group_memberships
  FOR ALL
  USING      ( is_group_leader(group_chat_id) OR is_elevated() )
  WITH CHECK ( is_group_leader(group_chat_id) OR is_elevated() );

-- JOIN REQUESTS POLICIES
CREATE POLICY join_self
  ON public.join_requests
  FOR ALL
  USING      ( user_id = auth.uid() )
  WITH CHECK ( user_id = auth.uid() );

-- FIXED: Split multi-command policy 'join_leader' into two separate policies.
CREATE POLICY join_leader_read
  ON public.join_requests
  FOR SELECT
  USING (
       is_group_leader(group_chat_id)
    OR is_elevated()
  );

CREATE POLICY join_leader_update
  ON public.join_requests
  FOR UPDATE
  USING (
       is_group_leader(group_chat_id)
    OR is_elevated()
  )
  WITH CHECK (
       is_group_leader(group_chat_id)
    OR is_elevated()
  );


-- CONTEXTUAL ROLES POLICIES
CREATE POLICY contextual_leader_manage
  ON public.contextual_roles
  FOR ALL
  USING      ( role_in('elder','pastor','admin') )
  WITH CHECK ( role_in('elder','pastor','admin') );

-- ROLE EVENTS POLICIES
CREATE POLICY role_events_insert
  ON public.role_events
  FOR INSERT
  WITH CHECK ( role_in('elder','pastor','admin') );

CREATE POLICY role_events_read
  ON public.role_events
  FOR SELECT
  USING ( role_in('elder','pastor','admin') );

-- INACTIVE MEMBERS POLICIES
CREATE POLICY inactive_read
  ON public.inactive_members
  FOR SELECT
  USING ( role_in('pastor','admin') );

CREATE POLICY inactive_manage
  ON public.inactive_members
  FOR ALL
  USING      ( role_in('pastor','admin') )
  WITH CHECK ( role_in('pastor','admin') );

-- =====================================================
-- STEP 6: SETUP PROPER GRANTS
-- =====================================================

-- Revoke direct access to profiles table from authenticated users
REVOKE ALL ON public.profiles FROM authenticated;

-- Grant access to the redacted view instead
GRANT SELECT ON public.v_profiles TO authenticated;

-- Revoke dangerous operations
REVOKE DELETE ON public.profiles FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.role_events FROM PUBLIC;

-- Grant delete on profiles only to service_role (for admin operations)
GRANT DELETE ON public.profiles TO service_role;

-- =====================================================
-- STEP 7: SET FUNCTION OWNERSHIP
-- =====================================================

ALTER FUNCTION public.current_global_role() OWNER TO postgres;
ALTER FUNCTION public.role_in(VARIADIC global_role[]) OWNER TO postgres;
ALTER FUNCTION public.is_group_leader(UUID,UUID) OWNER TO postgres;
ALTER FUNCTION public.is_elevated(UUID) OWNER TO postgres;

-- =====================================================
-- STEP 8: UPDATE DEFAULT VISIBILITY SETTINGS
-- =====================================================

-- Update existing profiles with incomplete visibility settings
UPDATE public.profiles
SET visibility = jsonb_build_object(
  'phone', COALESCE(visibility->>'phone', 'private'),
  'birthday', COALESCE(visibility->>'birthday', 'private'),
  'address', COALESCE(visibility->>'address', 'private'),
  'email', COALESCE(visibility->>'email', 'pastoral')
)
WHERE visibility IS NULL 
   OR NOT (visibility ? 'phone' AND visibility ? 'birthday' AND visibility ? 'address' AND visibility ? 'email');