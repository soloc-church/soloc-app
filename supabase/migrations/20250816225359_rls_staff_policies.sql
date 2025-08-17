-- 2025-08-16 security: enable RLS and staff policies for admin/dashboard + member-detail

-- 0) Helper: who counts as "staff" (admin/pastor/elder)
-- SECURITY DEFINER so it can read profiles reliably during policy checks.
create or replace function public.is_site_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('admin','pastor','elder')
  );
$$;

-- 1) PROFILES
alter table public.profiles enable row level security;

-- Staff can read all profiles (needed for Admin Dashboard + Member Detail)
drop policy if exists profiles_staff_select on public.profiles;
create policy profiles_staff_select
on public.profiles
for select
to authenticated
using (public.is_site_staff());

-- Everyone can read their own profile (fixes "create ministry" flows that peek at the current user)
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Updates: user can update self; staff can update anyone
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_staff_update on public.profiles;
create policy profiles_staff_update
on public.profiles
for update
to authenticated
using (public.is_site_staff())
with check (true);

-- 2) MINISTRIES, GROUPS, JOIN REQUESTS, ROLE EVENTS
-- Minimal policies so Admin Dashboard counts & admin actions work.

alter table public.ministries   enable row level security;
alter table public.group_chats  enable row level security;
alter table public.join_requests enable row level security;
alter table public.role_events  enable row level security;

-- Staff full access on these admin tables
-- (Tighten later if you want finer-grained scoping.)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ministries' and policyname='ministries_staff_all'
  ) then
    create policy ministries_staff_all
    on public.ministries
    for all
    to authenticated
    using (public.is_site_staff())
    with check (public.is_site_staff());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='group_chats' and policyname='group_chats_staff_all'
  ) then
    create policy group_chats_staff_all
    on public.group_chats
    for all
    to authenticated
    using (public.is_site_staff())
    with check (public.is_site_staff());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='join_requests' and policyname='join_requests_staff_all'
  ) then
    create policy join_requests_staff_all
    on public.join_requests
    for all
    to authenticated
    using (public.is_site_staff())
    with check (public.is_site_staff());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_events' and policyname='role_events_staff_select'
  ) then
    create policy role_events_staff_select
    on public.role_events
    for select
    to authenticated
    using (public.is_site_staff());
  end if;
end$$;

-- 3) Quiet "security definer view" lint (if you use v_profiles)
-- On PG ≥15 we can flip to security invoker so the view obeys caller's RLS.
do $$
begin
  if exists (
    select 1 from pg_views v
    where v.schemaname = 'public' and v.viewname = 'v_profiles'
  ) then
    alter view public.v_profiles set (security_invoker = on);
  end if;
end$$;
