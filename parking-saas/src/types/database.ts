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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          permit_id: string
          property_id: string
          token: string
          type: Database["public"]["Enums"]["credential_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          permit_id: string
          property_id: string
          token: string
          type?: Database["public"]["Enums"]["credential_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          permit_id?: string
          property_id?: string
          token?: string
          type?: Database["public"]["Enums"]["credential_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentials_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      permit_zone_access: {
        Row: {
          permit_id: string
          zone_id: string
        }
        Insert: {
          permit_id: string
          zone_id: string
        }
        Update: {
          permit_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_zone_access_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_zone_access_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          property_id: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["permit_status"]
          type: Database["public"]["Enums"]["permit_type"]
          unit_id: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vehicle_id: string | null
          visitor_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          property_id: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          type: Database["public"]["Enums"]["permit_type"]
          unit_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_id?: string | null
          visitor_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          type?: Database["public"]["Enums"]["permit_type"]
          unit_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_id?: string | null
          visitor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address1: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          organization_id: string | null
          settings: Json
          state: string | null
          timezone: string
          updated_at: string
          zip: string | null
        }
        Insert: {
          address1?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          settings?: Json
          state?: string | null
          timezone?: string
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address1?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          settings?: Json
          state?: string | null
          timezone?: string
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_members: {
        Row: {
          created_at: string
          property_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_events: {
        Row: {
          credential_id: string | null
          details: Json
          id: string
          lat: number | null
          lng: number | null
          permit_id: string | null
          property_id: string
          scan_result: string
          scan_time: string
          scanned_by: string | null
        }
        Insert: {
          credential_id?: string | null
          details?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          permit_id?: string | null
          property_id: string
          scan_result: string
          scan_time?: string
          scanned_by?: string | null
        }
        Update: {
          credential_id?: string | null
          details?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          permit_id?: string | null
          property_id?: string
          scan_result?: string
          scan_time?: string
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_events_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_claim_codes: {
        Row: {
          code_hash: string
          created_at: string
          is_active: boolean
          property_id: string
          rotated_at: string | null
          unit_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          is_active?: boolean
          property_id: string
          rotated_at?: string | null
          unit_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          is_active?: boolean
          property_id?: string
          rotated_at?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_claim_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_claim_codes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          id: string
          email: string
          token: string
          invited_by: string | null
          created_at: string
          expires_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          id?: string
          email: string
          token?: string
          invited_by?: string | null
          created_at?: string
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          id?: string
          email?: string
          token?: string
          invited_by?: string | null
          created_at?: string
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          user_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      unit_members: {
        Row: {
          created_at: string
          unit_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          unit_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_members_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          building: string | null
          claim_code_hash: string | null
          created_at: string
          floor: number | null
          id: string
          max_vehicles: number
          notes: string | null
          property_id: string
          unit_label: string
          updated_at: string
        }
        Insert: {
          building?: string | null
          claim_code_hash?: string | null
          created_at?: string
          floor?: number | null
          id?: string
          max_vehicles?: number
          notes?: string | null
          property_id: string
          unit_label: string
          updated_at?: string
        }
        Update: {
          building?: string | null
          claim_code_hash?: string | null
          created_at?: string
          floor?: number | null
          id?: string
          max_vehicles?: number
          notes?: string | null
          property_id?: string
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          make: string | null
          model: string | null
          owner_user_id: string | null
          plate: string
          property_id: string
          state: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          make?: string | null
          model?: string | null
          owner_user_id?: string | null
          plate: string
          property_id: string
          state?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          make?: string | null
          model?: string | null
          owner_user_id?: string | null
          plate?: string
          property_id?: string
          state?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_permit_with_credential: {
        Args: {
          p_notes?: string
          p_property_id: string
          p_type: string
          p_unit_id?: string
          p_valid_from?: string
          p_valid_to?: string
          p_vehicle_id?: string
          p_visitor_name?: string
        }
        Returns: Json
      }
      create_property: {
        Args: {
          p_address1?: string
          p_city?: string
          p_name: string
          p_state?: string
          p_timezone?: string
          p_zip?: string
        }
        Returns: string
      }
      has_property_role: {
        Args: {
          p_property_id: string
          p_roles: Database["public"]["Enums"]["member_role"][]
        }
        Returns: boolean
      }
      is_property_member: { Args: { p_property_id: string }; Returns: boolean }
      is_staff_plus: { Args: { p_property_id: string }; Returns: boolean }
      is_unit_member: { Args: { p_unit_id: string }; Returns: boolean }
      property_role: {
        Args: { p_property_id: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      set_unit_claim_code: {
        Args: { p_code: string; p_property_id: string; p_unit_label: string }
        Returns: undefined
      }
      admin_set_unit_claim_code: {
        Args: { p_property_id: string; p_unit_label: string; p_code: string }
        Returns: boolean
      }
      claim_unit: {
        Args: { p_code: string }
        Returns: Json
      }
      get_my_permits: {
        Args: { p_property_id: string }
        Returns: Json
      }
      get_my_units: {
        Args: { p_property_id: string }
        Returns: { id: string; unit_label: string }[]
      }
      resident_create_permit: {
        Args: { p_property_id: string; p_vehicle_id: string; p_unit_id?: string }
        Returns: string
      }
      get_unit_claim_codes: {
        Args: { p_property_id: string }
        Returns: Json
      }
      create_org_invite: {
        Args: { p_email: string }
        Returns: { token: string; expires_at: string }[]
      }
      validate_org_invite: {
        Args: { p_token: string }
        Returns: { email: string; is_valid: boolean; message: string }[]
      }
      consume_org_invite: {
        Args: { p_token: string }
        Returns: boolean
      }
    }
    Enums: {
      credential_type: "qr" | "rfid" | "plate_only"
      member_role:
        | "super_admin"
        | "org_admin"
        | "property_admin"
        | "staff"
        | "resident"
      permit_status: "active" | "expired" | "revoked"
      permit_type: "resident" | "visitor"
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
      credential_type: ["qr", "rfid", "plate_only"],
      member_role: [
        "super_admin",
        "org_admin",
        "property_admin",
        "staff",
        "resident",
      ],
      permit_status: ["active", "expired", "revoked"],
      permit_type: ["resident", "visitor"],
    },
  },
} as const
