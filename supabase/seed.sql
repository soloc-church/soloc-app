-- Ensure profiles exist for any auth users that might not have profiles
INSERT INTO public.profiles (
  id, 
  email, 
  full_name, 
  global_role,
  is_active,
  visibility,
  joined_date,
  created_at,
  updated_at
)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  COALESCE((au.raw_user_meta_data->>'global_role')::global_role, 'guest'),
  true,
  jsonb_build_object(
    'phone', 'private',
    'birthday', 'private',
    'address', 'private',
    'email', 'pastoral'
  ),
  COALESCE((au.created_at)::date, CURRENT_DATE),
  NOW(),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
);

-- Create sample ministries (if they don't exist)
INSERT INTO public.ministries (name, description, is_active)
VALUES 
  ('Worship', 'Music and worship ministry', true),
  ('Youth', 'Youth and young adults ministry', true),
  ('Children', 'Children''s ministry', true),
  ('Outreach', 'Community outreach and evangelism', true)
ON CONFLICT (name) DO NOTHING;

-- Create sample teams
INSERT INTO public.teams (ministry_id, name, description, is_active)
SELECT 
  m.id,
  t.name,
  t.description,
  true
FROM public.ministries m
CROSS JOIN (
  VALUES 
    ('Leadership Team', 'Ministry leadership and coordination'),
    ('Volunteer Team', 'Ministry volunteers and helpers')
) AS t(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams 
  WHERE ministry_id = m.id AND name = t.name
);

-- Create sample group chats
INSERT INTO public.group_chats (name, description, visibility, ministry_id, is_active)
SELECT 
  m.name || ' Group',
  'Group chat for ' || m.name || ' ministry',
  'members',
  m.id,
  true
FROM public.ministries m
WHERE NOT EXISTS (
  SELECT 1 FROM public.group_chats gc 
  WHERE gc.ministry_id = m.id
);

-- Add a general church announcement group
INSERT INTO public.group_chats (name, description, visibility, is_active)
VALUES 
  ('Church Announcements', 'General church announcements and updates', 'public', true),
  ('Prayer Requests', 'Share and pray for prayer requests', 'members', true),
  ('Bible Study', 'Weekly Bible study discussions', 'members', true)
ON CONFLICT DO NOTHING;

-- Log summary
DO $$
DECLARE
  profile_count integer;
  ministry_count integer;
  team_count integer;
  group_count integer;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO ministry_count FROM public.ministries;
  SELECT COUNT(*) INTO team_count FROM public.teams;
  SELECT COUNT(*) INTO group_count FROM public.group_chats;
  
  RAISE NOTICE 'Seed complete: % profiles, % ministries, % teams, % groups', 
    profile_count, ministry_count, team_count, group_count;
END $$;