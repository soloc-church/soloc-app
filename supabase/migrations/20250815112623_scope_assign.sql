-- 20250815_rbac_reads.sql
SET search_path = public;

-- List scopes for a given type (tab)
CREATE OR REPLACE FUNCTION public.list_scopes(p_scope_type public.scope_type)
RETURNS TABLE(id uuid, name text, type public.scope_type, description text, parent text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.name, 'ministry'::public.scope_type, m.description, NULL::text
  FROM public.ministries m
  WHERE p_scope_type = 'ministry' AND m.is_active

  UNION ALL

  SELECT t.id, t.name, 'team'::public.scope_type, t.description,
         (SELECT name FROM public.ministries WHERE id = t.ministry_id)
  FROM public.teams t
  WHERE p_scope_type = 'team' AND t.is_active

  UNION ALL

  SELECT g.id, g.name, 'group_chat'::public.scope_type, g.description,
         COALESCE(
           (SELECT name FROM public.ministries WHERE id = g.ministry_id),
           (SELECT name FROM public.teams      WHERE id = g.team_id)
         )
  FROM public.group_chats g
  WHERE p_scope_type = 'group_chat' AND g.is_active;
$$;

ALTER FUNCTION public.list_scopes(public.scope_type) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_scopes(public.scope_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_scopes(public.scope_type) TO authenticated;


-- List assignable members (member+), optional search, with limit
CREATE OR REPLACE FUNCTION public.list_assignable_members(q text DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT id, COALESCE(full_name, email) AS full_name, email
    FROM public.profiles
    WHERE is_active IS TRUE
      AND global_role <> 'guest'
  )
  SELECT id, full_name, email
  FROM base
  WHERE q IS NULL
     OR (full_name ILIKE '%'||q||'%' OR email ILIKE '%'||q||'%')
  ORDER BY full_name NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

ALTER FUNCTION public.list_assignable_members(text, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_assignable_members(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_members(text, int) TO authenticated;
