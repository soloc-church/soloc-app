-- Helper (kept)
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

-- 1) PROFILES: staff + self (select/update)
alter table public.profiles enable row level security;

do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_staff_select') then
    drop policy profiles_staff_select on public.profiles;
  end if;
  create policy profiles_staff_select
  on public.profiles
  for select
  to authenticated
  using (public.is_site_staff());

  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_select') then
    drop policy profiles_self_select on public.profiles;
  end if;
  create policy profiles_self_select
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_update') then
    drop policy profiles_self_update on public.profiles;
  end if;
  create policy profiles_self_update
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_staff_update') then
    drop policy profiles_staff_update on public.profiles;
  end if;
  create policy profiles_staff_update
  on public.profiles
  for update
  to authenticated
  using (public.is_site_staff())
  with check (true);
end $$;

-- 2) GROUP MEMBERSHIPS: drop ANY existing policies to kill recursion, then add non-recursive ones
alter table public.group_memberships enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname='public' and tablename='group_memberships'
  loop
    execute format('drop policy %I on public.group_memberships', r.policyname);
  end loop;

  -- Staff can do everything
  create policy gm_staff_all
  on public.group_memberships
  for all
  to authenticated
  using (public.is_site_staff())
  with check (public.is_site_staff());

  -- A user can see/join/leave their own membership rows (no recursion)
  create policy gm_self_select
  on public.group_memberships
  for select
  to authenticated
  using (user_id = auth.uid());

  create policy gm_self_insert
  on public.group_memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

  create policy gm_self_delete
  on public.group_memberships
  for delete
  to authenticated
  using (user_id = auth.uid());

  -- Group leaders/admins (from contextual_roles) can see membership rows in their groups
  -- NOTE: This references contextual_roles, not group_memberships -> avoids recursion.
  create policy gm_leader_select
  on public.group_memberships
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contextual_roles cr
      where cr.user_id = auth.uid()
        and cr.scope_type::text = 'group_chat'
        and cr.scope_id = group_chat_id                -- unqualified target-table column
        and cr.role_type::text in ('leader','admin')   -- compare as text to avoid enum literal errors
        and cr.is_active = true
    )
  );
end $$;

-- 3) GROUP CHATS: make sure staff can read (audit joins group_chats to label scope)
alter table public.group_chats enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='group_chats' and policyname='group_chats_staff_select'
  ) then
    create policy group_chats_staff_select
    on public.group_chats
    for select
    to authenticated
    using (public.is_site_staff());
  end if;
end $$;
