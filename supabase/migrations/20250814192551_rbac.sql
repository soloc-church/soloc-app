-- 20250814_rbac.sql
-- RBAC: enums, capability map, snapshot RPC, and atomic role-change RPCs
-- Idempotent-ish: guarded drops/creates where sensible.

SET search_path = public;

-- =========================================================
-- 1) ENUMS for better typegen
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scope_type') THEN
    CREATE TYPE scope_type AS ENUM ('ministry','team','group_chat');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contextual_role_type') THEN
    CREATE TYPE contextual_role_type AS ENUM ('ministry_leader','team_leader','group_leader','member');
  END IF;
END$$;

-- Rewire contextual_roles columns from TEXT to ENUM
-- Drop anonymous CHECKs if they exist (names may vary on different DBs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.contextual_roles'::regclass 
      AND conname = 'contextual_roles_role_type_check'
  ) THEN
    ALTER TABLE public.contextual_roles DROP CONSTRAINT contextual_roles_role_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.contextual_roles'::regclass 
      AND conname = 'contextual_roles_scope_type_check'
  ) THEN
    ALTER TABLE public.contextual_roles DROP CONSTRAINT contextual_roles_scope_type_check;
  END IF;
END$$;

ALTER TABLE public.contextual_roles
  ALTER COLUMN role_type  TYPE contextual_role_type USING role_type::contextual_role_type,
  ALTER COLUMN scope_type TYPE scope_type           USING scope_type::scope_type;

-- Optional: tighten role_events.scope_type to enum (still keep role_assigned as TEXT to cover global or contextual)
ALTER TABLE public.role_events
  ALTER COLUMN scope_type TYPE scope_type USING scope_type::scope_type;

-- =========================================================
-- 2) Capability map (global + contextual)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.capabilities (
  cap TEXT PRIMARY KEY
);

INSERT INTO public.capabilities (cap) VALUES
  ('open_admin'),
  ('approve_membership'),
  ('publish_content'),
  ('team_manage'),
  ('ministry_manage'),
  ('group_manage'),
  ('role_change_global'),
  ('role_assign_scoped'),
  ('role_revoke_scoped'),
  ('audit_read')
ON CONFLICT DO NOTHING;

-- Global role -> capability
CREATE TABLE IF NOT EXISTS public.global_role_capabilities (
  role public.global_role NOT NULL,
  cap  TEXT NOT NULL REFERENCES public.capabilities(cap) ON DELETE CASCADE,
  PRIMARY KEY (role, cap)
);

-- Contextual role -> capability (applies within the scope)
CREATE TABLE IF NOT EXISTS public.contextual_role_capabilities (
  role public.contextual_role_type NOT NULL,
  cap  TEXT NOT NULL REFERENCES public.capabilities(cap) ON DELETE CASCADE,
  PRIMARY KEY (role, cap)
);

-- Seed a sensible baseline
-- Elders+/admin see/administer; pastors often share elder caps; tweak as needed.
INSERT INTO public.global_role_capabilities(role, cap)
VALUES
  ('admin',  'open_admin'),
  ('admin',  'approve_membership'),
  ('admin',  'publish_content'),
  ('admin',  'team_manage'),
  ('admin',  'ministry_manage'),
  ('admin',  'group_manage'),
  ('admin',  'role_change_global'),
  ('admin',  'role_assign_scoped'),
  ('admin',  'role_revoke_scoped'),
  ('admin',  'audit_read'),

  ('pastor', 'open_admin'),
  ('pastor', 'approve_membership'),
  ('pastor', 'publish_content'),
  ('pastor', 'team_manage'),
  ('pastor', 'ministry_manage'),
  ('pastor', 'group_manage'),
  ('pastor', 'role_assign_scoped'),
  ('pastor', 'role_revoke_scoped'),
  ('pastor', 'audit_read'),

  ('elder',  'approve_membership'),
  ('elder',  'publish_content'),
  ('elder',  'team_manage'),
  ('elder',  'ministry_manage'),
  ('elder',  'group_manage'),
  ('elder',  'role_assign_scoped'),
  ('elder',  'role_revoke_scoped'),
  ('elder',  'audit_read'),

  ('member', 'publish_content')
ON CONFLICT DO NOTHING;

-- Contextual capabilities (within scope where the role is held)
INSERT INTO public.contextual_role_capabilities(role, cap)
VALUES
  ('group_leader',    'group_manage'),
  ('team_leader',     'team_manage'),
  ('ministry_leader', 'ministry_manage'),
  ('member',          'publish_content')
ON CONFLICT DO NOTHING;

-- =========================================================
-- 3) Helpers: union-of-caps and a simple has_cap()
-- =========================================================
-- Return TRUE if caller has a cap globally, or (if scope provided) within that scope.
CREATE OR REPLACE FUNCTION public.has_cap(
  p_cap TEXT,
  p_scope_type public.scope_type DEFAULT NULL,
  p_scope_id   UUID              DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH me AS (
    SELECT id, global_role FROM public.profiles WHERE id = auth.uid() LIMIT 1
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

-- =========================================================
-- 4) One-shot authz snapshot (for useAuthz())
-- =========================================================
-- Returns JSONB: { userId, globalRole, caps, contexts:[{scopeType,scopeId,roles,caps}] }
CREATE OR REPLACE FUNCTION public.get_authz_for_current_user()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER
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

-- =========================================================
-- 5) Invariants / indexes
-- =========================================================

-- =========================================================
-- 6) Atomic RPCs (Security Definer) for role changes
-- =========================================================

-- Admin-only: update a user's GLOBAL role (audited)
DROP FUNCTION IF EXISTS public.update_global_role(UUID, public.global_role, TEXT);
CREATE OR REPLACE FUNCTION public.update_global_role(
  target_user_id UUID,
  new_role       public.global_role,
  reason         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id  UUID := auth.uid();
  old_role  public.global_role;
BEGIN
  -- Only admins can change global roles
  IF NOT public.role_in('admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT global_role INTO old_role
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Optional defense-in-depth: Only admin can LOWER an admin
  IF old_role = 'admin' AND new_role <> 'admin' AND NOT public.role_in('admin') THEN
    RAISE EXCEPTION 'Only admin may demote an admin';
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
SET search_path = public
AS $$
DECLARE
  actor_id   UUID := auth.uid();
  tgt_role   public.global_role;
  inserted   public.contextual_roles;
BEGIN
  -- Only elder+ may assign contextual roles
  IF NOT public.role_in('elder','pastor','admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Members-only enforcement: target must be member+ (no guests)
  SELECT global_role INTO tgt_role
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF tgt_role = 'guest' THEN
    RAISE EXCEPTION 'Cannot assign contextual roles to guests';
  END IF;

  -- Single transaction: deactivate existing active role in this scope, then insert new one
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
SET search_path = public
AS $$
DECLARE
  actor_id  UUID := auth.uid();
  prev_role public.contextual_role_type;
BEGIN
  IF NOT public.role_in('elder','pastor','admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get current active role (if any)
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

-- =========================================================
-- 7) Optional: a pretty history view that joins names
-- =========================================================
DROP VIEW IF EXISTS public.role_events_view;
CREATE VIEW public.role_events_view AS
SELECT
  e.id,
  e.timestamp,
  e.action,
  e.role_assigned,
  e.scope_type,
  e.scope_id,
  e.reason,
  e.actor_id,
  a.full_name AS actor_name,
  e.target_id,
  t.full_name AS target_name
FROM public.role_events e
LEFT JOIN public.profiles a ON a.id = e.actor_id
LEFT JOIN public.profiles t ON t.id = e.target_id;
