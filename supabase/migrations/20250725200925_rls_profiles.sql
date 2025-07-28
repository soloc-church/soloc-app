-- Enable RLS --
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextual_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inactive_members    ENABLE ROW LEVEL SECURITY;

-- PROFILES RLS --
CREATE POLICY "Users can see own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Logged-in users can see other profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Elevated roles can manage any profile"
  ON public.profiles
  FOR ALL
  USING (public.has_elevated_role(auth.uid()));

-- FAMILY RELATIONSHIPS RLS --
CREATE POLICY "Users can manage own family links"
  ON public.family_relationships
  FOR ALL
  USING (auth.uid() = user_id_1);

CREATE POLICY "Elevated roles can view all family links"
  ON public.family_relationships
  FOR SELECT
  USING (public.has_elevated_role(auth.uid()));

-- GROUP CHATS RLS --
CREATE POLICY "Users can see groups based on visibility"
  ON public.group_chats
  FOR SELECT
  USING (
    (visibility = 'public') OR
    (visibility = 'request') OR
    (visibility = 'members' AND get_my_global_role() IN ('member', 'elder', 'pastor', 'admin')) OR
    (EXISTS (
       SELECT 1
       FROM public.group_memberships
       WHERE group_chat_id = group_chats.id
         AND user_id      = auth.uid()
     )) OR
    (public.has_elevated_role(auth.uid()))
  );

CREATE POLICY "Elders and above can create groups"
  ON public.group_chats
  FOR INSERT
  WITH CHECK (get_my_global_role() IN ('elder', 'pastor', 'admin'));

CREATE POLICY "Leaders or elevated roles can update groups"
  ON public.group_chats
  FOR UPDATE
  USING (
    public.is_group_leader(id, auth.uid())
    OR public.has_elevated_role(auth.uid())
  );

CREATE POLICY "Leaders or elevated roles can delete groups"
  ON public.group_chats
  FOR DELETE
  USING (
    public.is_group_leader(id, auth.uid())
    OR public.has_elevated_role(auth.uid())
  );

-- GROUP MEMBERSHIPS RLS --
CREATE POLICY "Users can view their own memberships"
  ON public.group_memberships
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Members can see other members of their groups"
  ON public.group_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_memberships gm
      WHERE gm.user_id       = auth.uid()
        AND gm.group_chat_id = group_memberships.group_chat_id
    )
  );

CREATE POLICY "Leaders can manage memberships in their groups"
  ON public.group_memberships
  FOR ALL
  USING (
    public.is_group_leader(group_chat_id, auth.uid())
    OR public.has_elevated_role(auth.uid())
  );

-- JOIN REQUESTS RLS --
CREATE POLICY "Users can manage their own join requests"
  ON public.join_requests
  FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Leaders can see and process requests for their group"
  ON public.join_requests
  FOR ALL
  USING (
    public.is_group_leader(group_chat_id, auth.uid())
    OR public.has_elevated_role(auth.uid())
  );

-- ADMIN‑LEVEL RLS (MINISTRIES, TEAMS, ROLES, EVENTS, ARCHIVE) --
CREATE POLICY "Elevated roles can manage core structures"
  ON public.ministries
  FOR ALL
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated roles can manage teams"
  ON public.teams
  FOR ALL
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated roles can manage roles"
  ON public.contextual_roles
  FOR ALL
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated roles can view audit events"
  ON public.role_events
  FOR SELECT
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated roles can manage inactive archive"
  ON public.inactive_members
  FOR ALL
  USING (public.has_elevated_role(auth.uid()));
