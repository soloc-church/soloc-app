export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      capabilities: {
        Row: {
          cap: string
        }
        Insert: {
          cap: string
        }
        Update: {
          cap?: string
        }
        Relationships: []
      }
      contextual_role_capabilities: {
        Row: {
          cap: string
          role: Database["public"]["Enums"]["contextual_role_type"]
        }
        Insert: {
          cap: string
          role: Database["public"]["Enums"]["contextual_role_type"]
        }
        Update: {
          cap?: string
          role?: Database["public"]["Enums"]["contextual_role_type"]
        }
        Relationships: [
          {
            foreignKeyName: "contextual_role_capabilities_cap_fkey"
            columns: ["cap"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["cap"]
          },
        ]
      }
      contextual_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          is_active: boolean | null
          role_type: Database["public"]["Enums"]["contextual_role_type"]
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean | null
          role_type: Database["public"]["Enums"]["contextual_role_type"]
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean | null
          role_type?: Database["public"]["Enums"]["contextual_role_type"]
          scope_id?: string
          scope_type?: Database["public"]["Enums"]["scope_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contextual_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contextual_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contextual_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contextual_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_relationships: {
        Row: {
          consent_given: boolean | null
          consent_given_at: string | null
          created_at: string
          relationship: Database["public"]["Enums"]["relationship_enum"]
          requires_consent: boolean | null
          user_id_1: string
          user_id_2: string
        }
        Insert: {
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          relationship: Database["public"]["Enums"]["relationship_enum"]
          requires_consent?: boolean | null
          user_id_1: string
          user_id_2: string
        }
        Update: {
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          relationship?: Database["public"]["Enums"]["relationship_enum"]
          requires_consent?: boolean | null
          user_id_1?: string
          user_id_2?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_relationships_user_id_1_fkey"
            columns: ["user_id_1"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_relationships_user_id_1_fkey"
            columns: ["user_id_1"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_relationships_user_id_2_fkey"
            columns: ["user_id_2"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_relationships_user_id_2_fkey"
            columns: ["user_id_2"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      global_role_capabilities: {
        Row: {
          cap: string
          role: Database["public"]["Enums"]["global_role"]
        }
        Insert: {
          cap: string
          role: Database["public"]["Enums"]["global_role"]
        }
        Update: {
          cap?: string
          role?: Database["public"]["Enums"]["global_role"]
        }
        Relationships: [
          {
            foreignKeyName: "global_role_capabilities_cap_fkey"
            columns: ["cap"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["cap"]
          },
        ]
      }
      group_chats: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          ministry_id: string | null
          name: string
          team_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ministry_id?: string | null
          name: string
          team_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ministry_id?: string | null
          name?: string
          team_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_type"]
        }
        Relationships: [
          {
            foreignKeyName: "group_chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chats_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          group_chat_id: string
          invited_by: string | null
          is_active: boolean | null
          joined_at: string
          user_id: string
        }
        Insert: {
          group_chat_id: string
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string
          user_id: string
        }
        Update: {
          group_chat_id?: string
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_chat_id_fkey"
            columns: ["group_chat_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inactive_members: {
        Row: {
          can_reactivate: boolean | null
          id: string
          inactivity_reason: string | null
          marked_inactive_at: string
          marked_inactive_by: string | null
          original_profile_id: string
          profile_data: Json
        }
        Insert: {
          can_reactivate?: boolean | null
          id?: string
          inactivity_reason?: string | null
          marked_inactive_at?: string
          marked_inactive_by?: string | null
          original_profile_id: string
          profile_data: Json
        }
        Update: {
          can_reactivate?: boolean | null
          id?: string
          inactivity_reason?: string | null
          marked_inactive_at?: string
          marked_inactive_by?: string | null
          original_profile_id?: string
          profile_data?: Json
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          group_chat_id: string
          id: string
          message: string | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          response_message: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          group_chat_id: string
          id?: string
          message?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          response_message?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          group_chat_id?: string
          id?: string
          message?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          response_message?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_group_chat_id_fkey"
            columns: ["group_chat_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ministries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          birthday: string | null
          created_at: string
          email: string | null
          full_name: string | null
          global_role: Database["public"]["Enums"]["global_role"]
          id: string
          is_active: boolean | null
          joined_date: string | null
          last_active_at: string | null
          notes: string | null
          phone: string | null
          profile_image_url: string | null
          updated_at: string
          visibility: Json
        }
        Insert: {
          address?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id: string
          is_active?: boolean | null
          joined_date?: string | null
          last_active_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_image_url?: string | null
          updated_at?: string
          visibility?: Json
        }
        Update: {
          address?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id?: string
          is_active?: boolean | null
          joined_date?: string | null
          last_active_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_image_url?: string | null
          updated_at?: string
          visibility?: Json
        }
        Relationships: []
      }
      role_events: {
        Row: {
          action: Database["public"]["Enums"]["role_action"]
          actor_id: string | null
          id: string
          reason: string | null
          role_assigned: string
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"] | null
          target_id: string
          timestamp: string
        }
        Insert: {
          action: Database["public"]["Enums"]["role_action"]
          actor_id?: string | null
          id?: string
          reason?: string | null
          role_assigned: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"] | null
          target_id: string
          timestamp?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["role_action"]
          actor_id?: string | null
          id?: string
          reason?: string | null
          role_assigned?: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"] | null
          target_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          ministry_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ministry_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ministry_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      role_events_view: {
        Row: {
          action: Database["public"]["Enums"]["role_action"] | null
          actor_id: string | null
          actor_name: string | null
          id: string | null
          reason: string | null
          role_assigned: string | null
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"] | null
          target_id: string | null
          target_name: string | null
          timestamp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_profiles: {
        Row: {
          address: string | null
          birthday: string | null
          email: string | null
          full_name: string | null
          global_role: Database["public"]["Enums"]["global_role"] | null
          id: string | null
          is_active: boolean | null
          joined_date: string | null
          phone: string | null
          profile_image_url: string | null
        }
        Insert: {
          address?: never
          birthday?: never
          email?: never
          full_name?: string | null
          global_role?: never
          id?: string | null
          is_active?: boolean | null
          joined_date?: string | null
          phone?: never
          profile_image_url?: string | null
        }
        Update: {
          address?: never
          birthday?: never
          email?: never
          full_name?: string | null
          global_role?: never
          id?: string | null
          is_active?: boolean | null
          joined_date?: string | null
          phone?: never
          profile_image_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_members: {
        Args: { p_limit?: number; q?: string }
        Returns: {
          email: string
          full_name: string
          global_role: Database["public"]["Enums"]["global_role"]
          id: string
          is_active: boolean
        }[]
      }
      current_global_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["global_role"]
      }
      get_authz_for_current_user: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_role_history: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          action: Database["public"]["Enums"]["role_action"]
          actor_name: string
          id: string
          reason: string
          role_assigned: string
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          timestamp: string
        }[]
      }
      get_user_contextual_roles: {
        Args: { p_user_id: string }
        Returns: {
          assigned_at: string
          id: string
          is_active: boolean
          role_type: Database["public"]["Enums"]["contextual_role_type"]
          scope_id: string
          scope_name: string
          scope_type: Database["public"]["Enums"]["scope_type"]
        }[]
      }
      grant_contextual_role: {
        Args: {
          reason?: string
          role_type: Database["public"]["Enums"]["contextual_role_type"]
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          target_user_id: string
        }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          id: string
          is_active: boolean | null
          role_type: Database["public"]["Enums"]["contextual_role_type"]
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          user_id: string
        }
      }
      has_cap: {
        Args: {
          p_cap: string
          p_scope_id?: string
          p_scope_type?: Database["public"]["Enums"]["scope_type"]
        }
        Returns: boolean
      }
      is_elevated: {
        Args: { p_uid?: string }
        Returns: boolean
      }
      is_group_leader: {
        Args: { p_group_id: string; p_user_id?: string }
        Returns: boolean
      }
      list_assignable_members: {
        Args: { p_limit?: number; q?: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      list_role_events: {
        Args: { p_limit?: number; p_target?: string }
        Returns: {
          action: Database["public"]["Enums"]["role_action"]
          actor_id: string | null
          id: string
          reason: string | null
          role_assigned: string
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"] | null
          target_id: string
          timestamp: string
        }[]
      }
      list_scopes: {
        Args: { p_scope_type: Database["public"]["Enums"]["scope_type"] }
        Returns: {
          description: string
          id: string
          name: string
          parent: string
          type: Database["public"]["Enums"]["scope_type"]
        }[]
      }
      revoke_contextual_role: {
        Args: {
          reason?: string
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          target_user_id: string
        }
        Returns: undefined
      }
      role_in: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_global_role: {
        Args: {
          new_role: Database["public"]["Enums"]["global_role"]
          reason?: string
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      contextual_role_type:
        | "ministry_leader"
        | "team_leader"
        | "group_leader"
        | "member"
      global_role: "admin" | "pastor" | "elder" | "member" | "guest"
      relationship_enum:
        | "spouse"
        | "parent"
        | "child"
        | "sibling"
        | "guardian"
        | "dependent"
      role_action: "assigned" | "revoked"
      scope_type: "ministry" | "team" | "group_chat"
      visibility_type: "public" | "members" | "request" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contextual_role_type: [
        "ministry_leader",
        "team_leader",
        "group_leader",
        "member",
      ],
      global_role: ["admin", "pastor", "elder", "member", "guest"],
      relationship_enum: [
        "spouse",
        "parent",
        "child",
        "sibling",
        "guardian",
        "dependent",
      ],
      role_action: ["assigned", "revoked"],
      scope_type: ["ministry", "team", "group_chat"],
      visibility_type: ["public", "members", "request", "private"],
    },
  },
} as const
