-- 20250814_rbac_api.sql
-- Purpose: Publish RBAC API via SECURITY DEFINER functions with safe search_path and tight EXECUTE grants.

SET search_path = public;

----------------------------------------------------------------------
-- 0) Hygiene: helper to restrict EXECUTE grants
----------------------------------------------------------------------
DO $$
BEGIN
  -- these roles exist in Supabase by default; adjust if your project differs
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Role "authenticated" not found; adjust GRANTs below if needed.';
  END IF;
END$$;

----------------------------------------------------------------------
-- 1) has_cap(): SECURITY DEFINER, limited to auth.uid(), safe search_path
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.has_cap(TEXT, public.scope_type, UUID);

CREATE OR REPLACE FUNCTION public.has_cap(
  p_cap TEXT,
  p_scope_type public.scope_type DEFAULT NULL,
  p_scope_id   UUID              DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
-- pg_temp prevents attackers from injecting objects into our path
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT id, global_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1
  ),
  global_caps AS (
    SELECT grc.cap
    FROM me
    JOIN public.global_role_capabilities grc ON grc.role = me.global_role
  ),
  ctx_caps AS (
    SELECT crc.cap
    FROM public.contextual_roles cr
    JOIN public.contextual_role_capabilities crc ON crc.role = cr.role_type
    WHERE cr.user_id = auth.uid()
      AND cr.is_active IS TRUE
      AND (p_scope_type IS NULL OR cr.scope_type = p_scope_type)
      AND (p_scope_id   IS NULL OR cr.scope_id   = p_scope_id)
  ),
  all_caps AS (
    SELECT cap FROM global_caps
    UNION
    SELECT cap FROM ctx_caps
  )
  SELECT EXISTS (SELECT 1 FROM all_caps WHERE cap = p_cap);
$$;

ALTER FUNCTION public.has_cap(TEXT, public.scope_type, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_cap(TEXT, public.scope_type, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_cap(TEXT, public.scope_type, UUID) TO authenticated;

----------------------------------------------------------------------
-- 2) get_authz_for_current_user(): SECURITY DEFINER, returns one JSON snapshot
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_authz_for_current_user();

CREATE OR REPLACE FUNCTION public.get_authz_for_current_user()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT id, global_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1
  ),
  g_caps AS (
    SELECT grc.cap
    FROM me
    JOIN public.global_role_capabilities grc ON grc.role = me.global_role
  ),
  ctx_raw AS (
    SELECT cr.scope_type, cr.scope_id,
           array_agg(DISTINCT cr.role_type::text)  AS roles,
           array_agg(DISTINCT crc.cap)             AS caps
    FROM public.contextual_roles cr
    JOIN public.contextual_role_capabilities crc ON crc.role = cr.role_type
    WHERE cr.user_id = auth.uid()
      AND cr.is_active IS TRUE
    GROUP BY cr.scope_type, cr.scope_id
  ),
  g_caps_json AS (
    SELECT COALESCE(jsonb_agg(DISTINCT cap), '[]'::jsonb) AS caps FROM g_caps
  ),
  ctx_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'scopeType', scope_type::text,
          'scopeId',   scope_id,
          'roles',     roles,
          'caps',      caps
        )
      ),
      '[]'::jsonb
    ) AS contexts
    FROM ctx_raw
  )
  SELECT jsonb_build_object(
    'userId',     me.id,
    'globalRole', me.global_role::text,
    'caps',       g_caps_json.caps,
    'contexts',   ctx_json.contexts
  )
  FROM me, g_caps_json, ctx_json;
$$;

ALTER FUNCTION public.get_authz_for_current_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_authz_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_authz_for_current_user() TO authenticated;

----------------------------------------------------------------------
-- 3) Atomic role mutations: SECURITY DEFINER + safe search_path
--    (If you already created them, we recreate to ensure consistent attributes)
----------------------------------------------------------------------

-- Admin-only: update a user's GLOBAL role (audited)
DROP FUNCTION IF EXISTS public.update_global_role(UUID, public.global_role, TEXT);

CREATE OR REPLACE FUNCTION public.update_global_role(
  target_user_id UUID,
  new_role       public.global_role,
  reason         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id  UUID := auth.uid();
  old_role  public.global_role;
  remaining_admins INT;
BEGIN
  -- Only admins can change global roles
  IF NOT public.role_in('admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Lock target row to avoid races
  SELECT global_role INTO old_role
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Defense-in-depth: never remove the last admin
  IF old_role = 'admin' AND new_role <> 'admin' THEN
    SELECT COUNT(*) INTO remaining_admins FROM public.profiles WHERE global_role = 'admin' AND id <> target_user_id;
    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'At least one admin must remain';
    END IF;
  END IF;

  UPDATE public.profiles
  SET global_role = new_role,
      updated_at  = timezone('utc', now())
  WHERE id = target_user_id;

  INSERT INTO public.role_events(actor_id, target_id, role_assigned, action, reason)
  VALUES (actor_id, target_user_id, new_role::TEXT, 'assigned',
          COALESCE(reason, format('Global role: %s → %s', old_role, new_role)));
END;
$$;

ALTER FUNCTION public.update_global_role(UUID, public.global_role, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_global_role(UUID, public.global_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_global_role(UUID, public.global_role, TEXT) TO authenticated;

-- Elder+ : GRANT/REPLACE contextual role in a scope (audited)
DROP FUNCTION IF EXISTS public.grant_contextual_role(UUID, public.contextual_role_type, public.scope_type, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.grant_contextual_role(
  target_user_id UUID,
  role_type      public.contextual_role_type,
  scope_type     public.scope_type,
  scope_id       UUID,
  reason         TEXT DEFAULT NULL
) RETURNS public.contextual_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id   UUID := auth.uid();
  tgt_role   public.global_role;
  inserted   public.contextual_roles;
BEGIN
  IF NOT public.role_in('elder','pastor','admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Members-only enforcement
  SELECT global_role INTO tgt_role
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF tgt_role = 'guest' THEN
    RAISE EXCEPTION 'Cannot assign contextual roles to guests';
  END IF;

  -- Deactivate existing active role for this scope, then insert
  UPDATE public.contextual_roles
  SET is_active = FALSE
  WHERE user_id    = target_user_id
    AND scope_type = scope_type
    AND scope_id   = scope_id
    AND is_active  IS TRUE;

  INSERT INTO public.contextual_roles(user_id, role_type, scope_type, scope_id, assigned_by, assigned_at, is_active)
  VALUES (target_user_id, role_type, scope_type, scope_id, actor_id, timezone('utc', now()), TRUE)
  RETURNING * INTO inserted;

  INSERT INTO public.role_events(actor_id, target_id, role_assigned, scope_type, scope_id, action, reason)
  VALUES (actor_id, target_user_id, role_type::TEXT, scope_type, scope_id, 'assigned',
          COALESCE(reason, format('Assigned %s in %s/%s', role_type, scope_type, scope_id)));

  RETURN inserted;
END;
$$;

ALTER FUNCTION public.grant_contextual_role(UUID, public.contextual_role_type, public.scope_type, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grant_contextual_role(UUID, public.contextual_role_type, public.scope_type, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_contextual_role(UUID, public.contextual_role_type, public.scope_type, UUID, TEXT) TO authenticated;

-- Elder+ : REVOKE contextual role in a scope (audited)
DROP FUNCTION IF EXISTS public.revoke_contextual_role(UUID, public.scope_type, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.revoke_contextual_role(
  target_user_id UUID,
  scope_type     public.scope_type,
  scope_id       UUID,
  reason         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id  UUID := auth.uid();
  prev_role public.contextual_role_type;
BEGIN
  IF NOT public.role_in('elder','pastor','admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role_type INTO prev_role
  FROM public.contextual_roles
  WHERE user_id    = target_user_id
    AND scope_type = scope_type
    AND scope_id   = scope_id
    AND is_active  IS TRUE
  LIMIT 1;

  IF prev_role IS NULL THEN
    RAISE EXCEPTION 'No active role in this scope';
  END IF;

  UPDATE public.contextual_roles
  SET is_active = FALSE
  WHERE user_id    = target_user_id
    AND scope_type = scope_type
    AND scope_id   = scope_id
    AND is_active  IS TRUE;

  INSERT INTO public.role_events(actor_id, target_id, role_assigned, scope_type, scope_id, action, reason)
  VALUES (actor_id, target_user_id, prev_role::TEXT, scope_type, scope_id, 'revoked',
          COALESCE(reason, 'Role revoked'));
END;
$$;

ALTER FUNCTION public.revoke_contextual_role(UUID, public.scope_type, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_contextual_role(UUID, public.scope_type, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_contextual_role(UUID, public.scope_type, UUID, TEXT) TO authenticated;

----------------------------------------------------------------------
-- 4) Optional: controlled history access via RPC (not direct table)
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_role_events(UUID, INT);

CREATE OR REPLACE FUNCTION public.list_role_events(
  p_target_user_id UUID DEFAULT NULL,
  p_limit          INT  DEFAULT 50
) RETURNS SETOF public.role_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Elders+ can read audit; others can only read their own entries
  IF public.has_cap('audit_read') THEN
    RETURN QUERY
      SELECT *
      FROM public.role_events
      WHERE (p_target_user_id IS NULL OR target_id = p_target_user_id)
      ORDER BY timestamp DESC
      LIMIT COALESCE(p_limit, 50);
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.role_events
      WHERE (actor_id = auth.uid() OR target_id = auth.uid())
        AND (p_target_user_id IS NULL OR target_id = p_target_user_id)
      ORDER BY timestamp DESC
      LIMIT COALESCE(p_limit, 50);
  END IF;
END;
$$;

ALTER FUNCTION public.list_role_events(UUID, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_role_events(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_role_events(UUID, INT) TO authenticated;
