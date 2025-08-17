-- 2025-08-16 api: canonical RPCs with stable composite types (no *_v2 clutter)

-- Helper remains (used by policies)
create or replace function public.is_site_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('admin','pastor','elder')
  );
$$;

-- 0) Stable composite types (future-proof: you can ALTER TYPE ... ADD ATTRIBUTE later)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'api_admin_stats' and typnamespace = 'public'::regnamespace) then
    create type public.api_admin_stats as (
      totalMembers int,
      activeMembers int,
      totalMinistries int,
      totalGroups int,
      pendingRequests int,
      recentActivity int
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'api_role_event' and typnamespace = 'public'::regnamespace) then
    create type public.api_role_event as (
      id uuid,
      actor_id uuid,
      actor_full_name text,
      target_id uuid,
      target_full_name text,
      role_assigned text,
      action text,
      scope_type text,
      scope_id uuid,
      scope_name text,
      "timestamp" timestamptz
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'api_user_count' and typnamespace = 'public'::regnamespace) then
    create type public.api_user_count as (
      user_id uuid,
      active_count int
    );
  end if;
end$$;

-- 1) RLS: ensure staff can SELECT on all joined tables used by RPCs
alter table if exists public.teams               enable row level security;
alter table if exists public.contextual_roles    enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='teams' and policyname='teams_staff_select') then
    create policy teams_staff_select
    on public.teams
    for select
    to authenticated
    using (public.is_site_staff());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contextual_roles' and policyname='contextual_roles_staff_select') then
    create policy contextual_roles_staff_select
    on public.contextual_roles
    for select
    to authenticated
    using (public.is_site_staff());
  end if;
end $$;

-- 2) Admin Dashboard — canonical RPC, returns SETOF composite (1 row)
drop function if exists public.get_admin_stats();  -- clean slate (return type might change)
create function public.get_admin_stats()
returns setof public.api_admin_stats
language sql
security invoker
set search_path = public
stable
as $$
  select
    (select count(*)::int from public.profiles)                                       as totalMembers,
    (select count(*)::int from public.profiles where is_active = true)                as activeMembers,
    (select count(*)::int from public.ministries  where is_active = true)             as totalMinistries,
    (select count(*)::int from public.group_chats where is_active = true)             as totalGroups,
    (select count(*)::int from public.join_requests where status = 'pending')         as pendingRequests,
    (select count(*)::int from public.role_events where "timestamp" >= now() - interval '7 days') as recentActivity
$$;

-- 3) Audit — canonical name `list_role_events` (drop old signature, recreate enriched)
drop function if exists public.list_role_events(uuid, integer);
create function public.list_role_events(
  p_target uuid default null,
  p_limit  integer default 100
)
returns setof public.api_role_event
language sql
security invoker
set search_path = public
stable
as $$
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

-- 4) Members — batch contextual role counts, canonical RPC
drop function if exists public.list_contextual_roles_counts(uuid[]);
create function public.list_contextual_roles_counts(
  p_user_ids uuid[]
)
returns setof public.api_user_count
language sql
security invoker
set search_path = public
stable
as $$
  select user_id, count(*)::int as active_count
  from public.contextual_roles
  where is_active = true
    and user_id = any (p_user_ids)
  group by user_id
$$;

-- 5) GRANT execute (RLS still guards underlying tables)
grant execute on function public.get_admin_stats()                         to authenticated, service_role;
grant execute on function public.list_role_events(uuid, integer)           to authenticated, service_role;
grant execute on function public.list_contextual_roles_counts(uuid[])      to authenticated, service_role;

-- 6) Housekeeping: remove the temporary enriched name if you created it earlier
drop function if exists public.list_role_events_enriched(uuid, integer);
