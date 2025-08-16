-- =========================================================
-- RBAC fixes 
-- =========================================================

-- 0) Ensure capability uniqueness (so ON CONFLICT does something)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.global_role_capabilities'::regclass
      AND conname = 'global_role_capabilities_role_cap_key'
  ) THEN
    ALTER TABLE public.global_role_capabilities
      ADD CONSTRAINT global_role_capabilities_role_cap_key
      UNIQUE (role, cap);
  END IF;
END$$;

-- Ensure elder has open_admin capability
INSERT INTO public.global_role_capabilities(role, cap)
VALUES ('elder', 'open_admin')
ON CONFLICT (role, cap) DO NOTHING;

-- =========================================================
-- 1) Harden is_elevated IN PLACE (do NOT DROP — policies depend on it)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_elevated(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  -- Non-elevated callers can only evaluate themselves (prevents role probing).
  WITH caller AS (
    SELECT COALESCE((
      SELECT global_role IN ('elder','pastor','admin')
      FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1
    ), false) AS is_caller_elevated
  )
  SELECT COALESCE((
    SELECT global_role IN ('elder','pastor','admin')
    FROM public.profiles
    WHERE id = COALESCE(
      CASE WHEN (SELECT is_caller_elevated FROM caller)
           THEN p_uid
           ELSE auth.uid()
      END,
      auth.uid()
    )
    LIMIT 1
  ), false);
$$;

ALTER FUNCTION public.is_elevated(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_elevated(uuid) TO authenticated;

-- =========================================================
-- 2) list_scopes: return type changed -> DROP then CREATE
--    CASCADE is fine here since you're early in dev; it will
--    drop any accidental dependents on old shape.
-- =========================================================
DROP FUNCTION IF EXISTS public.list_scopes(public.scope_type) CASCADE;

CREATE FUNCTION public.list_scopes(p_scope_type public.scope_type)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  parent text,
  type public.scope_type
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT m.id, m.name, m.description::text, NULL::text AS parent,
         'ministry'::public.scope_type
  FROM public.ministries m
  WHERE p_scope_type = 'ministry' AND m.is_active = true

  UNION ALL

  SELECT t.id, t.name, t.description::text,
         (SELECT name FROM public.ministries WHERE id = t.ministry_id),
         'team'::public.scope_type
  FROM public.teams t
  WHERE p_scope_type = 'team' AND t.is_active = true

  UNION ALL

  SELECT g.id, g.name, g.description::text,
         COALESCE(
           (SELECT name FROM public.teams WHERE id = g.team_id),
           (SELECT name FROM public.ministries WHERE id = g.ministry_id)
         ),
         'group_chat'::public.scope_type
  FROM public.group_chats g
  WHERE p_scope_type = 'group_chat' AND g.is_active = true;
$$;

ALTER FUNCTION public.list_scopes(public.scope_type) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_scopes(public.scope_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_scopes(public.scope_type) TO authenticated;

-- =========================================================
-- 3) RPCs (recreate with sane gating; no drops needed)
-- =========================================================

-- admin_list_members: only elders+ may enumerate
CREATE OR REPLACE FUNCTION public.admin_list_members(
  q       text DEFAULT NULL,
  p_limit int  DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  global_role public.global_role,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT p.id, p.full_name, p.email, p.global_role, p.is_active
  FROM public.profiles p
  WHERE public.is_elevated(auth.uid())
    AND (q IS NULL
         OR p.full_name ILIKE '%'||q||'%'
         OR p.email ILIKE '%'||q||'%')
  ORDER BY p.full_name NULLS LAST
  LIMIT p_limit;
$$;

ALTER FUNCTION public.admin_list_members(text, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_members(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members(text, int) TO authenticated;

-- list_assignable_members: gated to elevated (avoid mass email scraping)
CREATE OR REPLACE FUNCTION public.list_assignable_members(
  q       text DEFAULT NULL,
  p_limit int  DEFAULT 50
)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.v_profiles p
  WHERE public.is_elevated(auth.uid())
    AND p.global_role <> 'guest'
    AND (q IS NULL
         OR p.full_name ILIKE '%'||q||'%'
         OR p.email     ILIKE '%'||q||'%')
  ORDER BY p.full_name NULLS LAST
  LIMIT p_limit;
$$;

ALTER FUNCTION public.list_assignable_members(text, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_assignable_members(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_members(text, int) TO authenticated;

-- list_role_events: elders+ see all; others see own
-- Drop the old version so we can rename the argument (p_target_user_id -> p_target)
DROP FUNCTION IF EXISTS public.list_role_events(uuid, int);

CREATE FUNCTION public.list_role_events(
  p_target uuid DEFAULT NULL,
  p_limit  int  DEFAULT 100
)
RETURNS SETOF public.role_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  IF public.is_elevated(auth.uid()) THEN
    RETURN QUERY
      SELECT *
      FROM public.role_events
      WHERE p_target IS NULL OR target_id = p_target
      ORDER BY "timestamp" DESC
      LIMIT p_limit;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.role_events
      WHERE (actor_id = auth.uid() OR target_id = auth.uid())
        AND (p_target IS NULL OR target_id = p_target)
      ORDER BY "timestamp" DESC
      LIMIT p_limit;
  END IF;
END;
$$;

ALTER FUNCTION public.list_role_events(uuid, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_role_events(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_role_events(uuid, int) TO authenticated;


-- get_user_contextual_roles: elders+ only
CREATE OR REPLACE FUNCTION public.get_user_contextual_roles(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  role_type public.contextual_role_type,
  scope_type public.scope_type,
  scope_id uuid,
  scope_name text,
  is_active boolean,
  assigned_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT 
    cr.id,
    cr.role_type,
    cr.scope_type,
    cr.scope_id,
    CASE 
      WHEN cr.scope_type = 'ministry'   THEN (SELECT name FROM public.ministries   WHERE id = cr.scope_id)
      WHEN cr.scope_type = 'team'       THEN (SELECT name FROM public.teams       WHERE id = cr.scope_id)
      WHEN cr.scope_type = 'group_chat' THEN (SELECT name FROM public.group_chats WHERE id = cr.scope_id)
    END AS scope_name,
    cr.is_active,
    cr.assigned_at
  FROM public.contextual_roles cr
  WHERE cr.user_id = p_user_id
    AND public.is_elevated(auth.uid())
  ORDER BY cr.assigned_at DESC;
$$;

ALTER FUNCTION public.get_user_contextual_roles(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_contextual_roles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_contextual_roles(uuid) TO authenticated;

-- get_role_history: elders+ only
CREATE OR REPLACE FUNCTION public.get_role_history(
  p_user_id uuid,
  p_limit   int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  action public.role_action,
  role_assigned text,
  scope_type public.scope_type,
  scope_id uuid,
  reason text,
  "timestamp" timestamp with time zone,
  actor_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT 
    re.id,
    re.action,
    re.role_assigned,
    re.scope_type,
    re.scope_id,
    re.reason,
    re."timestamp",
    (SELECT full_name FROM public.profiles WHERE id = re.actor_id) AS actor_name
  FROM public.role_events re
  WHERE re.target_id = p_user_id
    AND public.is_elevated(auth.uid())
  ORDER BY re."timestamp" DESC
  LIMIT p_limit;
$$;

ALTER FUNCTION public.get_role_history(uuid, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_role_history(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_role_history(uuid, int) TO authenticated;

-- =========================================================
-- 4) (Optional) Undo broad table grants if you had them earlier.
--    Harmless if not present; keeps data behind the RPCs.
-- =========================================================
REVOKE SELECT ON public.v_profiles       FROM authenticated;
REVOKE SELECT ON public.ministries       FROM authenticated;
REVOKE SELECT ON public.teams            FROM authenticated;
REVOKE SELECT ON public.group_chats      FROM authenticated;
REVOKE SELECT ON public.contextual_roles FROM authenticated;
REVOKE SELECT ON public.role_events      FROM authenticated;
