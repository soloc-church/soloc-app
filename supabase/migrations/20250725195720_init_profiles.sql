CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CUSTOM TYPES --
CREATE TYPE global_role AS ENUM ('admin', 'pastor', 'elder', 'member', 'guest');
CREATE TYPE visibility_type AS ENUM ('public', 'members', 'request', 'private');
CREATE TYPE role_action AS ENUM ('assigned', 'revoked');
CREATE TYPE relationship_enum AS ENUM ('spouse', 'parent', 'child', 'sibling', 'guardian', 'dependent');


-- PROFILES -- 
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    phone TEXT,
    birthday DATE,
    address TEXT,
    profile_image_url TEXT,
    global_role global_role DEFAULT 'guest' NOT NULL,
    visibility JSONB NOT NULL DEFAULT '{"phone":"private", "birthday":"private", "address":"private"}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    joined_date DATE DEFAULT CURRENT_DATE
);
COMMENT ON COLUMN public.profiles.is_active IS 'Informational flag for pastoral care, not for RLS access control.';
COMMENT ON COLUMN public.profiles.visibility IS 'Per-field privacy settings, e.g., {"phone": "private"}.';

-- FAMILY RELATIONS --
CREATE TABLE IF NOT EXISTS public.family_relationships (
    user_id_1 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_id_2 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    relationship relationship_enum NOT NULL,
    -- consent flags are relevant for guardian/dependent relationships
    requires_consent BOOLEAN DEFAULT false,
    consent_given BOOLEAN DEFAULT false,
    consent_given_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id_1, user_id_2)
);
COMMENT ON COLUMN public.family_relationships.relationship IS 'Describes the relationship of user_2 relative to user_1.';

-- MINISTRY -- 
CREATE TABLE IF NOT EXISTS public.ministries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SUB TEAMS --
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ministry_id UUID REFERENCES public.ministries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(ministry_id, name)
);

-- CHATS -- 
CREATE TABLE IF NOT EXISTS public.group_chats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    visibility visibility_type DEFAULT 'public' NOT NULL,
    ministry_id UUID REFERENCES public.ministries(id) ON DELETE SET NULL,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CONTEXTUAL ROLES --
CREATE TABLE IF NOT EXISTS public.contextual_roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role_type TEXT CHECK(role_type IN ('ministry_leader', 'team_leader', 'group_leader', 'member')) NOT NULL,
    scope_type TEXT CHECK (scope_type IN ('ministry', 'team', 'group_chat')) NOT NULL,
    scope_id UUID NOT NULL,
    assigned_by UUID REFERENCES public.profiles(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- GROUP MEMBERSHIPS
CREATE TABLE IF NOT EXISTS public.group_memberships (
    group_chat_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    invited_by UUID REFERENCES public.profiles(id),
    PRIMARY KEY (group_chat_id, user_id)
);

-- AUDIT -- 
CREATE TABLE IF NOT EXISTS public.join_requests(
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_chat_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending', 
    processed_by UUID REFERENCES public.profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    message TEXT,
    response_message TEXT
);

CREATE TABLE IF NOT EXISTS public.role_events(
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_id UUID REFERENCES public.profiles(id) NOT NULL,
    role_assigned TEXT NOT NULL,
    scope_type TEXT,
    scope_id UUID,
    action role_action NOT NULL,
    reason TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INACTIVITY --
CREATE TABLE IF NOT EXISTS public.inactive_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    original_profile_id UUID NOT NULL UNIQUE,
    profile_data JSONB NOT NULL,
    inactivity_reason TEXT,
    marked_inactive_by UUID,
    marked_inactive_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    can_reactivate BOOLEAN DEFAULT TRUE
);

-- INDEXES -- 
CREATE INDEX IF NOT EXISTS idx_profiles_global_role ON public.profiles(global_role);
CREATE INDEX IF NOT EXISTS idx_family_user1 ON public.family_relationships(user_id_1);
CREATE INDEX IF NOT EXISTS idx_family_user2 ON public.family_relationships(user_id_2);
CREATE INDEX IF NOT EXISTS idx_contextual_roles_user ON public.contextual_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_contextual_roles_scope ON public.contextual_roles(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_role_events_timestamp ON public.role_events(timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contextual_roles_active ON public.contextual_roles(user_id, scope_type, scope_id) WHERE is_active IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_join_requests_pending ON public.join_requests(group_chat_id, user_id) WHERE status = 'pending';