// lib/services/profileService.ts
import {supabase} from '../supabase';
import {Database} from '@/types/database.types'


export type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
type VisibilitySettings = {
    phone?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    email?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    birthday?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
    address?: 'public' | 'members' | 'leaders' | 'pastoral' | 'private';
};

export class ProfileService { 
    /**Get current user's profile with email from auth */
    static async getCurrentUserProfile(): Promise<Profile | null> {
        const {data: {user}, error: userErr} = await supabase.auth.getUser();
        if(userErr) throw userErr;
        if(!user) return null;

        const {data, error} = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;
        
        // Add email from auth user if not in profile
        if (data && !data.email) {
            data.email = user.email || null;
        }
        
        return data ?? null;
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

    /**Get specific profile by id (uses redacted view) */
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

    /**Update user password */
    static async updatePassword(currentPassword: string, newPassword: string) {
        const {data: {user}} = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Verify current password first
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email!,
            password: currentPassword,
        });

        if (signInError) {
            throw new Error('Current password is incorrect');
        }

        // Update password
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return { success: true };
    }

    /**Update visibility settings */
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
    static async uploadProfileImage(file: any) {
        const {data: {user}} = await supabase.auth.getUser();
        if(!user) throw new Error('Not authenticated');

        // For React Native, we need to convert the image URI to a blob
        const response = await fetch(file.uri);
        const blob = await response.blob();

        const fileExt = file.uri.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // First, delete old profile images if they exist
        try {
            const { data: oldFiles } = await supabase.storage
                .from('profiles')
                .list(user.id);
            
            if (oldFiles && oldFiles.length > 0) {
                const filesToDelete = oldFiles.map(file => `${user.id}/${file.name}`);
                await supabase.storage
                    .from('profiles')
                    .remove(filesToDelete);
            }
        } catch (err) {
            console.log('No existing files to delete');
        }

        // Upload new image to storage
        const {error: uploadError, data: uploadData } = await supabase.storage
            .from('profiles')
            .upload(filePath, blob, {
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // Get public url
        const {data: { publicUrl } } = supabase.storage
            .from('profiles')
            .getPublicUrl(filePath);

        // Update profile with the new image url
        const {data, error} = await supabase
            .from('profiles')
            .update({profile_image_url: publicUrl})
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**Delete user account */
    static async deleteAccount() {
        const {data: {user}} = await supabase.auth.getUser();
        if(!user) throw new Error('Not authenticated');

        // This would typically require calling a server-side function
        // as users cannot delete their own auth records directly
        const { error } = await supabase.rpc('delete_user_account', {
            user_id: user.id
        });

        if (error) throw error;
        
        // Sign out after deletion
        await supabase.auth.signOut();
        
        return { success: true };
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