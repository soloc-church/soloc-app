

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."api_admin_stats" AS (
	"totalmembers" integer,
	"activemembers" integer,
	"totalministries" integer,
	"totalgroups" integer,
	"pendingrequests" integer,
	"recentactivity" integer
);


ALTER TYPE "public"."api_admin_stats" OWNER TO "postgres";


CREATE TYPE "public"."api_role_event" AS (
	"id" "uuid",
	"actor_id" "uuid",
	"actor_full_name" "text",
	"target_id" "uuid",
	"target_full_name" "text",
	"role_assigned" "text",
	"action" "text",
	"scope_type" "text",
	"scope_id" "uuid",
	"scope_name" "text",
	"timestamp" timestamp with time zone
);


ALTER TYPE "public"."api_role_event" OWNER TO "postgres";


CREATE TYPE "public"."api_user_count" AS (
	"user_id" "uuid",
	"active_count" integer
);


ALTER TYPE "public"."api_user_count" OWNER TO "postgres";


CREATE TYPE "public"."contextual_role_type" AS ENUM (
    'ministry_leader',
    'team_leader',
    'group_leader',
    'member'
);


ALTER TYPE "public"."contextual_role_type" OWNER TO "postgres";


CREATE TYPE "public"."global_role" AS ENUM (
    'admin',
    'pastor',
    'elder',
    'member',
    'guest'
);


ALTER TYPE "public"."global_role" OWNER TO "postgres";


CREATE TYPE "public"."relationship_enum" AS ENUM (
    'spouse',
    'parent',
    'child',
    'sibling',
    'guardian',
    'dependent'
);


ALTER TYPE "public"."relationship_enum" OWNER TO "postgres";


CREATE TYPE "public"."role_action" AS ENUM (
    'assigned',
    'revoked'
);


ALTER TYPE "public"."role_action" OWNER TO "postgres";


CREATE TYPE "public"."scope_type" AS ENUM (
    'ministry',
    'team',
    'group_chat'
);


ALTER TYPE "public"."scope_type" OWNER TO "postgres";


CREATE TYPE "public"."visibility_type" AS ENUM (
    'public',
    'members',
    'request',
    'private'
);


ALTER TYPE "public"."visibility_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_members"("q" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text", "global_role" "public"."global_role", "is_active" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."admin_list_members"("q" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_global_role"() RETURNS "public"."global_role"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT global_role
  FROM   public.profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;


ALTER FUNCTION "public"."current_global_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_stats"() RETURNS SETOF "public"."api_admin_stats"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    (select count(*)::int from public.profiles)                                       as totalMembers,
    (select count(*)::int from public.profiles where is_active = true)                as activeMembers,
    (select count(*)::int from public.ministries  where is_active = true)             as totalMinistries,
    (select count(*)::int from public.group_chats where is_active = true)             as totalGroups,
    (select count(*)::int from public.join_requests where status = 'pending')         as pendingRequests,
    (select count(*)::int from public.role_events where "timestamp" >= now() - interval '7 days') as recentActivity
$$;


ALTER FUNCTION "public"."get_admin_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_authz_for_current_user"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_authz_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "action" "public"."role_action", "role_assigned" "text", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text", "timestamp" timestamp with time zone, "actor_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "scope_name" "text", "is_active" boolean, "assigned_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contextual_roles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_type" "public"."contextual_role_type" NOT NULL,
    "scope_type" "public"."scope_type" NOT NULL,
    "scope_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."contextual_roles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text" DEFAULT NULL::"text") RETURNS "public"."contextual_roles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If profile already exists, update it
    UPDATE public.profiles
    SET 
      email = NEW.email,
      updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_email_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET 
      email = NEW.email,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_email_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type" DEFAULT NULL::"public"."scope_type", "p_scope_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type", "p_scope_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_elevated"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."is_elevated"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_leader"("p_group_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."is_group_leader"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_site_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('admin','pastor','elder')
  );
$$;


ALTER FUNCTION "public"."is_site_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_assignable_members"("q" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."list_assignable_members"("q" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_contextual_roles_counts"("p_user_ids" "uuid"[]) RETURNS SETOF "public"."api_user_count"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select user_id, count(*)::int as active_count
  from public.contextual_roles
  where is_active = true
    and user_id = any (p_user_ids)
  group by user_id
$$;


ALTER FUNCTION "public"."list_contextual_roles_counts"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_role_events"("p_target" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100) RETURNS SETOF "public"."api_role_event"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with ev as (
    select *
    from public.role_events e
    where (p_target is null or e.target_id = p_target)
    order by e."timestamp" desc
    limit p_limit
  )
  select
    e.id,
    e.actor_id,
    ap.full_name as actor_full_name,
    e.target_id,
    tp.full_name as target_full_name,
    e.role_assigned,
    e.action,
    e.scope_type::text as scope_type,
    e.scope_id,
    case
      when e.scope_type::text = 'ministry'   then m.name
      when e.scope_type::text = 'team'       then t.name
      when e.scope_type::text = 'group_chat' then g.name
      else null
    end as scope_name,
    e."timestamp"
  from ev e
  left join public.profiles   ap on ap.id = e.actor_id
  left join public.profiles   tp on tp.id = e.target_id
  left join public.ministries  m on m.id = e.scope_id and e.scope_type::text = 'ministry'
  left join public.teams       t on t.id = e.scope_id and e.scope_type::text = 'team'
  left join public.group_chats g on g.id = e.scope_id and e.scope_type::text = 'group_chat';
$$;


ALTER FUNCTION "public"."list_role_events"("p_target" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "parent" "text", "type" "public"."scope_type")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."role_in"(VARIADIC "p_roles" "public"."global_role"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT current_global_role() = ANY(p_roles);
$$;


ALTER FUNCTION "public"."role_in"(VARIADIC "p_roles" "public"."global_role"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capabilities" (
    "cap" "text" NOT NULL
);


ALTER TABLE "public"."capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contextual_role_capabilities" (
    "role" "public"."contextual_role_type" NOT NULL,
    "cap" "text" NOT NULL
);


ALTER TABLE "public"."contextual_role_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."family_relationships" (
    "user_id_1" "uuid" NOT NULL,
    "user_id_2" "uuid" NOT NULL,
    "relationship" "public"."relationship_enum" NOT NULL,
    "requires_consent" boolean DEFAULT false,
    "consent_given" boolean DEFAULT false,
    "consent_given_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."family_relationships" OWNER TO "postgres";


COMMENT ON COLUMN "public"."family_relationships"."relationship" IS 'Describes the relationship of user_2 relative to user_1.';



CREATE TABLE IF NOT EXISTS "public"."global_role_capabilities" (
    "role" "public"."global_role" NOT NULL,
    "cap" "text" NOT NULL
);


ALTER TABLE "public"."global_role_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "visibility" "public"."visibility_type" DEFAULT 'public'::"public"."visibility_type" NOT NULL,
    "ministry_id" "uuid",
    "team_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."group_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_memberships" (
    "group_chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_active" boolean DEFAULT true,
    "invited_by" "uuid"
);


ALTER TABLE "public"."group_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inactive_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "original_profile_id" "uuid" NOT NULL,
    "profile_data" "jsonb" NOT NULL,
    "inactivity_reason" "text",
    "marked_inactive_by" "uuid",
    "marked_inactive_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "can_reactivate" boolean DEFAULT true
);


ALTER TABLE "public"."inactive_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."join_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "message" "text",
    "response_message" "text",
    CONSTRAINT "join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ministries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."ministries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "birthday" "date",
    "address" "text",
    "profile_image_url" "text",
    "global_role" "public"."global_role" DEFAULT 'guest'::"public"."global_role" NOT NULL,
    "visibility" "jsonb" DEFAULT '{"phone": "private", "address": "private", "birthday": "private"}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "joined_date" "date" DEFAULT CURRENT_DATE,
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."visibility" IS 'Per-field privacy settings, e.g., {"phone": "private"}.';



COMMENT ON COLUMN "public"."profiles"."is_active" IS 'Informational flag for pastoral care, not for RLS access control.';



CREATE TABLE IF NOT EXISTS "public"."role_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "actor_id" "uuid",
    "target_id" "uuid" NOT NULL,
    "role_assigned" "text" NOT NULL,
    "scope_type" "public"."scope_type",
    "scope_id" "uuid",
    "action" "public"."role_action" NOT NULL,
    "reason" "text",
    "timestamp" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."role_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."role_events_view" AS
 SELECT "e"."id",
    "e"."timestamp",
    "e"."action",
    "e"."role_assigned",
    "e"."scope_type",
    "e"."scope_id",
    "e"."reason",
    "e"."actor_id",
    "a"."full_name" AS "actor_name",
    "e"."target_id",
    "t"."full_name" AS "target_name"
   FROM (("public"."role_events" "e"
     LEFT JOIN "public"."profiles" "a" ON (("a"."id" = "e"."actor_id")))
     LEFT JOIN "public"."profiles" "t" ON (("t"."id" = "e"."target_id")));


ALTER TABLE "public"."role_events_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ministry_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_profiles" WITH ("security_invoker"='on') AS
 SELECT "p"."id",
    "p"."full_name",
        CASE
            WHEN ("p"."id" = "auth"."uid"()) THEN "p"."phone"
            WHEN (NOT "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN NULL::"text"
            WHEN (("p"."visibility" ->> 'phone'::"text") = 'public'::"text") THEN "p"."phone"
            WHEN ((("p"."visibility" ->> 'phone'::"text") = 'members'::"text") AND "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."phone"
            WHEN ((("p"."visibility" ->> 'phone'::"text") = 'leaders'::"text") AND "public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."phone"
            WHEN ((("p"."visibility" ->> 'phone'::"text") = 'pastoral'::"text") AND "public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."phone"
            ELSE NULL::"text"
        END AS "phone",
        CASE
            WHEN ("p"."id" = "auth"."uid"()) THEN "p"."email"
            WHEN ((("p"."visibility" ->> 'email'::"text") = 'leaders'::"text") AND "public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."email"
            WHEN ((("p"."visibility" ->> 'email'::"text") = 'pastoral'::"text") AND "public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."email"
            ELSE NULL::"text"
        END AS "email",
        CASE
            WHEN ("p"."id" = "auth"."uid"()) THEN "p"."birthday"
            WHEN (("p"."visibility" ->> 'birthday'::"text") = 'public'::"text") THEN "p"."birthday"
            WHEN ((("p"."visibility" ->> 'birthday'::"text") = 'members'::"text") AND "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."birthday"
            WHEN ((("p"."visibility" ->> 'birthday'::"text") = 'leaders'::"text") AND "public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."birthday"
            WHEN ((("p"."visibility" ->> 'birthday'::"text") = 'pastoral'::"text") AND "public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."birthday"
            ELSE NULL::"date"
        END AS "birthday",
        CASE
            WHEN ("p"."id" = "auth"."uid"()) THEN "p"."address"
            WHEN (("p"."visibility" ->> 'address'::"text") = 'public'::"text") THEN "p"."address"
            WHEN ((("p"."visibility" ->> 'address'::"text") = 'members'::"text") AND "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."address"
            WHEN ((("p"."visibility" ->> 'address'::"text") = 'leaders'::"text") AND "public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."address"
            WHEN ((("p"."visibility" ->> 'address'::"text") = 'pastoral'::"text") AND "public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"])) THEN "p"."address"
            ELSE NULL::"text"
        END AS "address",
    "p"."joined_date",
    "p"."profile_image_url",
        CASE
            WHEN "public"."is_elevated"() THEN "p"."global_role"
            ELSE NULL::"public"."global_role"
        END AS "global_role",
    "p"."is_active"
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) OR "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));


ALTER TABLE "public"."v_profiles" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_profiles" IS 'Profiles view that enforces per-field visibility.  
 Query this instead of the base table outside admin contexts.';



ALTER TABLE ONLY "public"."capabilities"
    ADD CONSTRAINT "capabilities_pkey" PRIMARY KEY ("cap");



ALTER TABLE ONLY "public"."contextual_role_capabilities"
    ADD CONSTRAINT "contextual_role_capabilities_pkey" PRIMARY KEY ("role", "cap");



ALTER TABLE ONLY "public"."contextual_roles"
    ADD CONSTRAINT "contextual_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_relationships"
    ADD CONSTRAINT "family_relationships_pkey" PRIMARY KEY ("user_id_1", "user_id_2");



ALTER TABLE ONLY "public"."global_role_capabilities"
    ADD CONSTRAINT "global_role_capabilities_pkey" PRIMARY KEY ("role", "cap");



ALTER TABLE ONLY "public"."global_role_capabilities"
    ADD CONSTRAINT "global_role_capabilities_role_cap_key" UNIQUE ("role", "cap");



ALTER TABLE ONLY "public"."group_chats"
    ADD CONSTRAINT "group_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("group_chat_id", "user_id");



ALTER TABLE ONLY "public"."inactive_members"
    ADD CONSTRAINT "inactive_members_original_profile_id_key" UNIQUE ("original_profile_id");



ALTER TABLE ONLY "public"."inactive_members"
    ADD CONSTRAINT "inactive_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ministries"
    ADD CONSTRAINT "ministries_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ministries"
    ADD CONSTRAINT "ministries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_events"
    ADD CONSTRAINT "role_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_ministry_id_name_key" UNIQUE ("ministry_id", "name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_contextual_roles_scope" ON "public"."contextual_roles" USING "btree" ("scope_type", "scope_id");



CREATE INDEX "idx_contextual_roles_user" ON "public"."contextual_roles" USING "btree" ("user_id");



CREATE INDEX "idx_family_user1" ON "public"."family_relationships" USING "btree" ("user_id_1");



CREATE INDEX "idx_family_user2" ON "public"."family_relationships" USING "btree" ("user_id_2");



CREATE INDEX "idx_profiles_global_role" ON "public"."profiles" USING "btree" ("global_role");



CREATE INDEX "idx_role_events_timestamp" ON "public"."role_events" USING "btree" ("timestamp" DESC);



CREATE UNIQUE INDEX "uq_contextual_roles_active" ON "public"."contextual_roles" USING "btree" ("user_id", "scope_type", "scope_id") WHERE ("is_active" IS TRUE);



CREATE UNIQUE INDEX "uq_join_requests_pending" ON "public"."join_requests" USING "btree" ("group_chat_id", "user_id") WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "on_group_chats_update" BEFORE UPDATE ON "public"."group_chats" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_ministries_update" BEFORE UPDATE ON "public"."ministries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_profiles_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_teams_update" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."contextual_role_capabilities"
    ADD CONSTRAINT "contextual_role_capabilities_cap_fkey" FOREIGN KEY ("cap") REFERENCES "public"."capabilities"("cap") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contextual_roles"
    ADD CONSTRAINT "contextual_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contextual_roles"
    ADD CONSTRAINT "contextual_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_relationships"
    ADD CONSTRAINT "family_relationships_user_id_1_fkey" FOREIGN KEY ("user_id_1") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_relationships"
    ADD CONSTRAINT "family_relationships_user_id_2_fkey" FOREIGN KEY ("user_id_2") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."global_role_capabilities"
    ADD CONSTRAINT "global_role_capabilities_cap_fkey" FOREIGN KEY ("cap") REFERENCES "public"."capabilities"("cap") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_chats"
    ADD CONSTRAINT "group_chats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."group_chats"
    ADD CONSTRAINT "group_chats_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_chats"
    ADD CONSTRAINT "group_chats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_group_chat_id_fkey" FOREIGN KEY ("group_chat_id") REFERENCES "public"."group_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_group_chat_id_fkey" FOREIGN KEY ("group_chat_id") REFERENCES "public"."group_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ministries"
    ADD CONSTRAINT "ministries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_events"
    ADD CONSTRAINT "role_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_events"
    ADD CONSTRAINT "role_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE CASCADE;



CREATE POLICY "chat_create_elder" ON "public"."group_chats" FOR INSERT WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "chat_leader_delete" ON "public"."group_chats" FOR DELETE USING (("public"."is_group_leader"("id") OR "public"."is_elevated"()));



CREATE POLICY "chat_leader_update" ON "public"."group_chats" FOR UPDATE USING (("public"."is_group_leader"("id") OR "public"."is_elevated"())) WITH CHECK (("public"."is_group_leader"("id") OR "public"."is_elevated"()));



CREATE POLICY "chat_visibility" ON "public"."group_chats" FOR SELECT USING ((("visibility" = 'public'::"public"."visibility_type") OR (("visibility" = 'members'::"public"."visibility_type") AND "public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) OR (("visibility" = 'request'::"public"."visibility_type") AND (EXISTS ( SELECT 1
   FROM "public"."group_memberships" "gm"
  WHERE (("gm"."group_chat_id" = "group_chats"."id") AND ("gm"."user_id" = "auth"."uid"()))))) OR "public"."is_group_leader"("id") OR "public"."is_elevated"()));



CREATE POLICY "contextual_leader_manage" ON "public"."contextual_roles" USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



ALTER TABLE "public"."contextual_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contextual_roles_staff_select" ON "public"."contextual_roles" FOR SELECT TO "authenticated" USING ("public"."is_site_staff"());



CREATE POLICY "elevated_manage_profile" ON "public"."profiles" USING ("public"."is_elevated"());



CREATE POLICY "family_elevated" ON "public"."family_relationships" FOR SELECT USING ("public"."is_elevated"());



ALTER TABLE "public"."family_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "family_self" ON "public"."family_relationships" USING (("user_id_1" = "auth"."uid"())) WITH CHECK (("user_id_1" = "auth"."uid"()));



CREATE POLICY "gm_leader_select" ON "public"."group_memberships" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contextual_roles" "cr"
  WHERE (("cr"."user_id" = "auth"."uid"()) AND (("cr"."scope_type")::"text" = 'group_chat'::"text") AND ("cr"."scope_id" = "group_memberships"."group_chat_id") AND (("cr"."role_type")::"text" = ANY (ARRAY['leader'::"text", 'admin'::"text"])) AND ("cr"."is_active" = true)))));



CREATE POLICY "gm_self_delete" ON "public"."group_memberships" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "gm_self_insert" ON "public"."group_memberships" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "gm_self_select" ON "public"."group_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "gm_staff_all" ON "public"."group_memberships" TO "authenticated" USING ("public"."is_site_staff"()) WITH CHECK ("public"."is_site_staff"());



ALTER TABLE "public"."group_chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_chats_staff_all" ON "public"."group_chats" TO "authenticated" USING ("public"."is_site_staff"()) WITH CHECK ("public"."is_site_staff"());



CREATE POLICY "group_chats_staff_select" ON "public"."group_chats" FOR SELECT TO "authenticated" USING ("public"."is_site_staff"());



ALTER TABLE "public"."group_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inactive_manage" ON "public"."inactive_members" USING ("public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"])) WITH CHECK ("public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



ALTER TABLE "public"."inactive_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inactive_read" ON "public"."inactive_members" FOR SELECT USING ("public"."role_in"(VARIADIC ARRAY['pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "join_leader_read" ON "public"."join_requests" FOR SELECT USING (("public"."is_group_leader"("group_chat_id") OR "public"."is_elevated"()));



CREATE POLICY "join_leader_update" ON "public"."join_requests" FOR UPDATE USING (("public"."is_group_leader"("group_chat_id") OR "public"."is_elevated"())) WITH CHECK (("public"."is_group_leader"("group_chat_id") OR "public"."is_elevated"()));



ALTER TABLE "public"."join_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "join_requests_staff_all" ON "public"."join_requests" TO "authenticated" USING ("public"."is_site_staff"()) WITH CHECK ("public"."is_site_staff"());



CREATE POLICY "join_self" ON "public"."join_requests" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ministries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ministries_staff_all" ON "public"."ministries" TO "authenticated" USING ("public"."is_site_staff"()) WITH CHECK ("public"."is_site_staff"());



CREATE POLICY "ministry_delete" ON "public"."ministries" FOR DELETE USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "ministry_insert" ON "public"."ministries" FOR INSERT WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "ministry_read" ON "public"."ministries" FOR SELECT USING ("public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "ministry_update" ON "public"."ministries" FOR UPDATE USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_staff_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_site_staff"());



CREATE POLICY "profiles_staff_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_site_staff"()) WITH CHECK (true);



ALTER TABLE "public"."role_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_events_insert" ON "public"."role_events" FOR INSERT WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "role_events_read" ON "public"."role_events" FOR SELECT USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "role_events_staff_select" ON "public"."role_events" FOR SELECT TO "authenticated" USING ("public"."is_site_staff"());



CREATE POLICY "self_manage_profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "self_update_profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "team_delete" ON "public"."teams" FOR DELETE USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "team_insert" ON "public"."teams" FOR INSERT WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "team_read" ON "public"."teams" FOR SELECT USING ("public"."role_in"(VARIADIC ARRAY['member'::"public"."global_role", 'elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



CREATE POLICY "team_update" ON "public"."teams" FOR UPDATE USING ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"])) WITH CHECK ("public"."role_in"(VARIADIC ARRAY['elder'::"public"."global_role", 'pastor'::"public"."global_role", 'admin'::"public"."global_role"]));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_staff_select" ON "public"."teams" FOR SELECT TO "authenticated" USING ("public"."is_site_staff"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."admin_list_members"("q" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_members"("q" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_members"("q" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_members"("q" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_global_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_global_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_global_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_authz_for_current_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_authz_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_authz_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_authz_for_current_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_role_history"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_contextual_roles"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."contextual_roles" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."contextual_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."contextual_roles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_contextual_role"("target_user_id" "uuid", "role_type" "public"."contextual_role_type", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type", "p_scope_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type", "p_scope_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type", "p_scope_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cap"("p_cap" "text", "p_scope_type" "public"."scope_type", "p_scope_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_elevated"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_elevated"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_elevated"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_leader"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_leader"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_leader"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_site_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_site_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_site_staff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_assignable_members"("q" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_assignable_members"("q" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_assignable_members"("q" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_assignable_members"("q" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_contextual_roles_counts"("p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."list_contextual_roles_counts"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_contextual_roles_counts"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_role_events"("p_target" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_role_events"("p_target" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_role_events"("p_target" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") TO "anon";
GRANT ALL ON FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_scopes"("p_scope_type" "public"."scope_type") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_contextual_role"("target_user_id" "uuid", "scope_type" "public"."scope_type", "scope_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."role_in"(VARIADIC "p_roles" "public"."global_role"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."role_in"(VARIADIC "p_roles" "public"."global_role"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_in"(VARIADIC "p_roles" "public"."global_role"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_global_role"("target_user_id" "uuid", "new_role" "public"."global_role", "reason" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."capabilities" TO "anon";
GRANT ALL ON TABLE "public"."capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."contextual_role_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."contextual_role_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."contextual_role_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."family_relationships" TO "anon";
GRANT ALL ON TABLE "public"."family_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."family_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."global_role_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."global_role_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."global_role_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."group_chats" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."group_chats" TO "service_role";



GRANT ALL ON TABLE "public"."group_memberships" TO "anon";
GRANT ALL ON TABLE "public"."group_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."group_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."inactive_members" TO "anon";
GRANT ALL ON TABLE "public"."inactive_members" TO "authenticated";
GRANT ALL ON TABLE "public"."inactive_members" TO "service_role";



GRANT ALL ON TABLE "public"."join_requests" TO "anon";
GRANT ALL ON TABLE "public"."join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."ministries" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."ministries" TO "authenticated";
GRANT ALL ON TABLE "public"."ministries" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_events" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_events" TO "authenticated";
GRANT ALL ON TABLE "public"."role_events" TO "service_role";



GRANT ALL ON TABLE "public"."role_events_view" TO "anon";
GRANT ALL ON TABLE "public"."role_events_view" TO "authenticated";
GRANT ALL ON TABLE "public"."role_events_view" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."v_profiles" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."v_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
