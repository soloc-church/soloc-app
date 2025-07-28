
-- GET GLOBAL ROLE --
CREATE OR REPLACE FUNCTION public.get_my_global_role()
RETURNS global_role AS $$
  SELECT global_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

-- CHECK USER HAS ELEVATED PRIVILEGE -- 
CREATE OR REPLACE FUNCTION public.has_elevated_role(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND global_role IN ('admin', 'pastor', 'elder')
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER;

-- CHECK USER IS LEADER OF A GROURP -- 
CREATE OR REPLACE FUNCTION public.is_group_leader(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contextual_roles
    WHERE scope_type = 'group_chat'
      AND scope_id = p_group_id
      AND user_id = p_user_id
      AND role_type = 'group_leader'
      AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER;

-- AUTO UPDATE update_at -- 
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ATTACH updated_at --
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_ministries_update BEFORE UPDATE ON public.ministries FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_teams_update BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_group_chats_update BEFORE UPDATE ON public.group_chats FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- TRIGGER CREATE A PROFILE WHEN USER SIGNS UP --
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, global_role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE((NEW.raw_user_meta_data->>'global_role')::global_role, 'guest')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ATTACH 'new user' trigger -- 
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();