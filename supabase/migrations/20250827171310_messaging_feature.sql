-- supabase/migrations/20250827000000_messaging_features.sql

-- =====================================================
-- MESSAGING FEATURE ENHANCEMENTS
-- =====================================================

-- 1) Add Stream Chat integration fields
ALTER TABLE public.group_chats 
ADD COLUMN IF NOT EXISTS stream_channel_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stream_channel_type TEXT DEFAULT 'messaging',
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS gathering_days TEXT[], -- e.g. ['Monday', 'Thursday']
ADD COLUMN IF NOT EXISTS is_general_channel BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_group_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Add Stream Chat user mapping
CREATE TABLE IF NOT EXISTS public.stream_users (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    stream_user_id TEXT NOT NULL UNIQUE,
    stream_user_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Direct messages tracking (for UI display, actual messages in Stream)
CREATE TABLE IF NOT EXISTS public.direct_message_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    stream_channel_id TEXT NOT NULL UNIQUE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

-- 4) Subteam structure (subgroups)
CREATE TABLE IF NOT EXISTS public.subteams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_group_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL,
    group_chat_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL UNIQUE,
    subteam_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_group_id, subteam_number)
);

-- 5) Group join requests enhancement
ALTER TABLE public.join_requests
ADD COLUMN IF NOT EXISTS requested_subteam_id UUID REFERENCES public.subteams(id) ON DELETE CASCADE;

-- 6) Track read receipts and unread counts (backup for Stream)
CREATE TABLE IF NOT EXISTS public.message_read_status (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    unread_count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_group_chats_stream ON public.group_chats(stream_channel_id);
CREATE INDEX IF NOT EXISTS idx_group_chats_parent ON public.group_chats(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_users ON public.direct_message_channels(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_subteams_parent ON public.subteams(parent_group_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Stream users: users can see their own mapping
ALTER TABLE public.stream_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_users_self" ON public.stream_users
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "stream_users_staff" ON public.stream_users
    FOR SELECT USING (public.is_elevated());

-- Direct message channels: users can see their own conversations
ALTER TABLE public.direct_message_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_channels_self" ON public.direct_message_channels
    FOR ALL USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- Subteams: follow parent group visibility
ALTER TABLE public.subteams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subteams_visibility" ON public.subteams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_chats gc
            WHERE gc.id = subteams.parent_group_id
            AND (
                gc.visibility = 'public' OR
                (gc.visibility = 'members' AND public.role_in('member','elder','pastor','admin')) OR
                public.is_elevated() OR
                EXISTS (
                    SELECT 1 FROM public.group_memberships gm
                    WHERE gm.group_chat_id IN (subteams.parent_group_id, subteams.group_chat_id)
                    AND gm.user_id = auth.uid()
                    AND gm.is_active = true
                )
            )
        )
    );

-- Message read status: users manage their own
ALTER TABLE public.message_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_status_self" ON public.message_read_status
    FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get or create Stream user mapping
CREATE OR REPLACE FUNCTION public.get_or_create_stream_user(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stream_id TEXT;
BEGIN
    -- Check if mapping exists
    SELECT stream_user_id INTO v_stream_id
    FROM public.stream_users
    WHERE user_id = p_user_id;
    
    IF v_stream_id IS NULL THEN
        -- Create new Stream ID (using UUID for uniqueness)
        v_stream_id := 'user_' || replace(p_user_id::TEXT, '-', '');
        
        INSERT INTO public.stream_users (user_id, stream_user_id)
        VALUES (p_user_id, v_stream_id)
        ON CONFLICT (user_id) DO UPDATE
        SET updated_at = NOW()
        RETURNING stream_user_id INTO v_stream_id;
    END IF;
    
    RETURN v_stream_id;
END;
$$;

-- Create general channel for groups with subteams
CREATE OR REPLACE FUNCTION public.ensure_general_channel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If this is a parent group (has subteams), ensure general channel exists
    IF EXISTS (SELECT 1 FROM public.subteams WHERE parent_group_id = NEW.id) THEN
        -- Check if general channel already exists
        IF NOT EXISTS (
            SELECT 1 FROM public.group_chats 
            WHERE parent_group_id = NEW.id AND is_general_channel = true
        ) THEN
            -- Create general channel
            INSERT INTO public.group_chats (
                name,
                description,
                visibility,
                ministry_id,
                team_id,
                parent_group_id,
                is_general_channel,
                created_by
            ) VALUES (
                NEW.name || ' - General',
                'General discussion for all ' || NEW.name || ' members',
                NEW.visibility,
                NEW.ministry_id,
                NEW.team_id,
                NEW.id,
                true,
                NEW.created_by
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger to create general channel when first subteam is added
CREATE TRIGGER ensure_general_channel_on_subteam
    AFTER INSERT ON public.subteams
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_general_channel();

-- Update member count
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_active != OLD.is_active) THEN
        UPDATE public.group_chats
        SET member_count = (
            SELECT COUNT(*)
            FROM public.group_memberships
            WHERE group_chat_id = NEW.group_chat_id
            AND is_active = true
        )
        WHERE id = NEW.group_chat_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.group_chats
        SET member_count = (
            SELECT COUNT(*)
            FROM public.group_memberships
            WHERE group_chat_id = OLD.group_chat_id
            AND is_active = true
        )
        WHERE id = OLD.group_chat_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_member_count
    AFTER INSERT OR UPDATE OR DELETE ON public.group_memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.update_group_member_count();

-- =====================================================
-- RPCs FOR MESSAGING
-- =====================================================

-- Get groups for discovery with proper visibility
CREATE OR REPLACE FUNCTION public.get_discoverable_groups(
    p_search TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    visibility visibility_type,
    member_count INT,
    gathering_days TEXT[],
    ministry_name TEXT,
    team_name TEXT,
    is_member BOOLEAN,
    has_subteams BOOLEAN,
    stream_channel_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT 
        gc.id,
        gc.name,
        gc.description,
        gc.visibility,
        COALESCE(gc.member_count, 0) AS member_count,
        gc.gathering_days,
        m.name AS ministry_name,
        t.name AS team_name,
        EXISTS (
            SELECT 1 FROM public.group_memberships gm
            WHERE gm.group_chat_id = gc.id 
            AND gm.user_id = auth.uid()
            AND gm.is_active = true
        ) AS is_member,
        EXISTS (
            SELECT 1 FROM public.subteams st
            WHERE st.parent_group_id = gc.id
        ) AS has_subteams,
        gc.stream_channel_id
    FROM public.group_chats gc
    LEFT JOIN public.ministries m ON m.id = gc.ministry_id
    LEFT JOIN public.teams t ON t.id = gc.team_id
    WHERE gc.is_active = true
        AND gc.parent_group_id IS NULL -- Only show parent groups
        AND (
            gc.visibility = 'public' OR
            (gc.visibility = 'members' AND public.role_in('member','elder','pastor','admin')) OR
            (gc.visibility = 'private' AND (
                public.is_elevated() OR
                EXISTS (
                    SELECT 1 FROM public.group_memberships gm2
                    WHERE gm2.group_chat_id = gc.id
                    AND gm2.user_id = auth.uid()
                    AND gm2.is_active = true
                )
            ))
        )
        AND (p_search IS NULL OR gc.name ILIKE '%' || p_search || '%')
    ORDER BY gc.name
    LIMIT p_limit;
$$;

-- Get subteams for a group
CREATE OR REPLACE FUNCTION public.get_group_subteams(p_group_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    member_count INT,
    subteam_number INT,
    is_member BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT 
        gc.id,
        gc.name,
        COALESCE(gc.member_count, 0) AS member_count,
        st.subteam_number,
        EXISTS (
            SELECT 1 FROM public.group_memberships gm
            WHERE gm.group_chat_id = gc.id
            AND gm.user_id = auth.uid()
            AND gm.is_active = true
        ) AS is_member
    FROM public.subteams st
    JOIN public.group_chats gc ON gc.id = st.group_chat_id
    WHERE st.parent_group_id = p_group_id
    AND gc.is_active = true
    ORDER BY st.subteam_number;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_stream_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_discoverable_groups(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_subteams(UUID) TO authenticated;