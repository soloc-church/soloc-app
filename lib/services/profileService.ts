import {supabase} from '../supabase';
import {Database} from '@/types/database.types'


type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
type VisibilitySettings = {
    phone?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    email?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    birthday?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    address?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
};

export class ProfileService { 
    /**Get user */
    static async getCurrentUserProfile() {
        const {data: {user}} = await supabase.auth.getUser();
        if(!user) throw new Error('Not authenticated');

        const {data, error} = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;
        return data;
    }

    /**Get other's profile */

    static async getProfiles(filters?: {
        search?: string;
        isActive?: boolean;
        limit?: number;
        offset?: number;
    }) {
        let query = supabase
            .from('v_profiles')
            .select('*', {count: 'exact' });

        if (filters?.search) {
            query = query.ilike('full_name', `%${filters.search}%`);
        }

        if (filters?.isActive !== undefined) {
            query = query.eq('is_active', filters.isActive);
        }

        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        if (filters?.offset) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);            
        }

        const {data, error, count }  = await query;

        if(error) throw error;
        return {profiles: data || [], count };
    }

    /**Get specific profile by id (uses readacted view) */
    static async getProfileById(userId: string) {
        const {data, error} = await supabase
            .from('v_profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    }

    /**Update current user's profile */
    static async updateProfile(updates: Omit<ProfileUpdate, 'id'>) {
        const {data: {user} } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const {data, error} = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**update visibility settings */
    static async updateVisibilitySettings(settings: VisibilitySettings) {
        const {data: {user} } = await supabase.auth.getUser();
        if(!user) throw new Error ('Not authenticated');

        //get current visibility settings
        const {data: profile } = await supabase
            .from('profiles')
            .select('visibility')
            .eq('id', user.id)
            .single();

        const currentVisibility = (profile?.visibility as any) || {};
        const updatedVisibility = {...currentVisibility, ...settings };

        const {data, error} = await supabase
            .from('profiles')
            .update({visibility: updatedVisibility})
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error
        return data;
    }

    /**Upload profile image */
    static async uploadProfileImage(file: File) {
        const {data: {user}} = await supabase.auth.getUser();
        if(!user) throw new Error('Not authenticated');

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `profile-images/${fileName}`;

        //upload image to storage
        const {error: uploadError } = await supabase.storage
            .from('profiles')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public url
        const {data: { publicUrl } } = supabase.storage
            .from('profiles')
            .getPublicUrl(filePath);

        // update profile with the new image url
        const {data, error} = await supabase
            .from('profiles')
            .update({profile_image_url: publicUrl})
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**Get global role */
    static async getCurrentUserRole() {
        const {data, error} = await supabase
            .rpc('current_global_role')

        if (error) throw error;
        return data as Database['public']['Enums']['global_role']
    }

    /**Check if current user has elevated privileges */
    static async isElevated() {
        const {data: {user}} = await supabase.auth.getUser();
        if(!user) return false;

        const {data, error} = await supabase
            .rpc('is_elevated', {p_uid: user.id});

        if (error) return false;

        return data;
    }
}