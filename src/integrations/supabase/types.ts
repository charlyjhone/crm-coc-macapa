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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_type: string
          actor: string | null
          created_at: string
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          related_entity_id: string | null
          related_entity_type: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          actor?: string | null
          created_at?: string
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          actor?: string | null
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      delivery_logs: {
        Row: {
          created_at: string
          destination: string
          id: string
          lead_id: string
          response: Json | null
          sent_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          destination: string
          id?: string
          lead_id: string
          response?: Json | null
          sent_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          lead_id?: string
          response?: Json | null
          sent_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          content_hash: string | null
          content_type: string | null
          created_at: string
          deleted_at: string | null
          email_message_id: string | null
          filename: string
          id: string
          lead_id: string | null
          legal_analysis: Json | null
          legal_analysis_at: string | null
          size_bytes: number | null
          storage_path: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          email_message_id?: string | null
          filename: string
          id?: string
          lead_id?: string | null
          legal_analysis?: Json | null
          legal_analysis_at?: string | null
          size_bytes?: number | null
          storage_path: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          email_message_id?: string | null
          filename?: string
          id?: string
          lead_id?: string | null
          legal_analysis?: Json | null
          legal_analysis_at?: string | null
          size_bytes?: number | null
          storage_path?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attachments_whatsapp_message_id_fkey"
            columns: ["whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          also_received_by: string[]
          created_at: string
          direction: string
          followup_intent: string | null
          followup_intent_at: string | null
          followup_intent_reason: string | null
          html_body: string | null
          id: string
          internet_message_id: string | null
          lead_id: string | null
          message: string | null
          outlook_message_id: string | null
          raw_data: Json | null
          recipients_bcc: string[]
          recipients_cc: string[]
          recipients_to: string[]
          resend_message_id: string | null
          subject: string | null
          timestamp: string
        }
        Insert: {
          also_received_by?: string[]
          created_at?: string
          direction?: string
          followup_intent?: string | null
          followup_intent_at?: string | null
          followup_intent_reason?: string | null
          html_body?: string | null
          id?: string
          internet_message_id?: string | null
          lead_id?: string | null
          message?: string | null
          outlook_message_id?: string | null
          raw_data?: Json | null
          recipients_bcc?: string[]
          recipients_cc?: string[]
          recipients_to?: string[]
          resend_message_id?: string | null
          subject?: string | null
          timestamp?: string
        }
        Update: {
          also_received_by?: string[]
          created_at?: string
          direction?: string
          followup_intent?: string | null
          followup_intent_at?: string | null
          followup_intent_reason?: string | null
          html_body?: string | null
          id?: string
          internet_message_id?: string | null
          lead_id?: string | null
          message?: string | null
          outlook_message_id?: string | null
          raw_data?: Json | null
          recipients_bcc?: string[]
          recipients_cc?: string[]
          recipients_to?: string[]
          resend_message_id?: string | null
          subject?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_close_probability: number | null
          ai_diagnosis: string | null
          ai_diagnosis_reason: string | null
          ai_diagnosis_updated_at: string | null
          ai_next_step: string | null
          archived: boolean | null
          client_interaction_count: number | null
          created_at: string
          data_proximo_pagamento: string | null
          delivered_at: string | null
          description: string | null
          description_updated_at: string | null
          email: string | null
          email_inbound_count: number | null
          email_outbound_count: number | null
          emails: string[] | null
          ganho_at: string | null
          id: string
          is_recurring: boolean | null
          language: string | null
          last_inbound_message: string | null
          last_inbound_message_at: string | null
          last_outbound_message: string | null
          last_outbound_message_at: string | null
          message: string | null
          moeda: string | null
          name: string
          negociacao_at: string | null
          origem: string | null
          perdido_at: string | null
          phone: string | null
          phones: string[] | null
          produto: string | null
          produzido_at: string | null
          profile_picture_url: string | null
          proposal_last_viewed_at: string | null
          proposal_sent_at: string | null
          proposal_url: string | null
          proposal_view_count: number | null
          publicidade_quantidade: number | null
          publicidade_subtipo: string | null
          reopened_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          suggested_followup: string | null
          unclassified: boolean | null
          updated_at: string | null
          valor: number | null
          valor_manually_edited: boolean | null
          valor_pago: number | null
          whatsapp_chat_lids: string[] | null
          whatsapp_inbound_count: number | null
          whatsapp_outbound_count: number | null
          whatsapp_phone_lid_map: Json
        }
        Insert: {
          ai_close_probability?: number | null
          ai_diagnosis?: string | null
          ai_diagnosis_reason?: string | null
          ai_diagnosis_updated_at?: string | null
          ai_next_step?: string | null
          archived?: boolean | null
          client_interaction_count?: number | null
          created_at?: string
          data_proximo_pagamento?: string | null
          delivered_at?: string | null
          description?: string | null
          description_updated_at?: string | null
          email?: string | null
          email_inbound_count?: number | null
          email_outbound_count?: number | null
          emails?: string[] | null
          ganho_at?: string | null
          id?: string
          is_recurring?: boolean | null
          language?: string | null
          last_inbound_message?: string | null
          last_inbound_message_at?: string | null
          last_outbound_message?: string | null
          last_outbound_message_at?: string | null
          message?: string | null
          moeda?: string | null
          name: string
          negociacao_at?: string | null
          origem?: string | null
          perdido_at?: string | null
          phone?: string | null
          phones?: string[] | null
          produto?: string | null
          produzido_at?: string | null
          profile_picture_url?: string | null
          proposal_last_viewed_at?: string | null
          proposal_sent_at?: string | null
          proposal_url?: string | null
          proposal_view_count?: number | null
          publicidade_quantidade?: number | null
          publicidade_subtipo?: string | null
          reopened_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          suggested_followup?: string | null
          unclassified?: boolean | null
          updated_at?: string | null
          valor?: number | null
          valor_manually_edited?: boolean | null
          valor_pago?: number | null
          whatsapp_chat_lids?: string[] | null
          whatsapp_inbound_count?: number | null
          whatsapp_outbound_count?: number | null
          whatsapp_phone_lid_map?: Json
        }
        Update: {
          ai_close_probability?: number | null
          ai_diagnosis?: string | null
          ai_diagnosis_reason?: string | null
          ai_diagnosis_updated_at?: string | null
          ai_next_step?: string | null
          archived?: boolean | null
          client_interaction_count?: number | null
          created_at?: string
          data_proximo_pagamento?: string | null
          delivered_at?: string | null
          description?: string | null
          description_updated_at?: string | null
          email?: string | null
          email_inbound_count?: number | null
          email_outbound_count?: number | null
          emails?: string[] | null
          ganho_at?: string | null
          id?: string
          is_recurring?: boolean | null
          language?: string | null
          last_inbound_message?: string | null
          last_inbound_message_at?: string | null
          last_outbound_message?: string | null
          last_outbound_message_at?: string | null
          message?: string | null
          moeda?: string | null
          name?: string
          negociacao_at?: string | null
          origem?: string | null
          perdido_at?: string | null
          phone?: string | null
          phones?: string[] | null
          produto?: string | null
          produzido_at?: string | null
          profile_picture_url?: string | null
          proposal_last_viewed_at?: string | null
          proposal_sent_at?: string | null
          proposal_url?: string | null
          proposal_view_count?: number | null
          publicidade_quantidade?: number | null
          publicidade_subtipo?: string | null
          reopened_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          suggested_followup?: string | null
          unclassified?: boolean | null
          updated_at?: string | null
          valor?: number | null
          valor_manually_edited?: boolean | null
          valor_pago?: number | null
          whatsapp_chat_lids?: string[] | null
          whatsapp_inbound_count?: number | null
          whatsapp_outbound_count?: number | null
          whatsapp_phone_lid_map?: Json
        }
        Relationships: []
      }
      meetings: {
        Row: {
          created_at: string
          dedup_key: string | null
          external_id: string
          external_url: string | null
          id: string
          lead_id: string
          meeting_date: string | null
          notes: string | null
          participants: Json | null
          raw_data: Json | null
          source: string
          summary: string | null
          title: string | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedup_key?: string | null
          external_id: string
          external_url?: string | null
          id?: string
          lead_id: string
          meeting_date?: string | null
          notes?: string | null
          participants?: Json | null
          raw_data?: Json | null
          source?: string
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedup_key?: string | null
          external_id?: string
          external_url?: string | null
          id?: string
          lead_id?: string
          meeting_date?: string | null
          notes?: string | null
          participants?: Json | null
          raw_data?: Json | null
          source?: string
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outlook_subscriptions: {
        Row: {
          change_type: string
          client_state: string
          created_at: string
          expiration_datetime: string
          id: string
          notification_url: string
          resource: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          change_type?: string
          client_state: string
          created_at?: string
          expiration_datetime: string
          id?: string
          notification_url: string
          resource: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          change_type?: string
          client_state?: string
          created_at?: string
          expiration_datetime?: string
          id?: string
          notification_url?: string
          resource?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      outlook_sync_state: {
        Row: {
          delta_link: string | null
          last_synced_at: string | null
          resource: string
          updated_at: string
        }
        Insert: {
          delta_link?: string | null
          last_synced_at?: string | null
          resource: string
          updated_at?: string
        }
        Update: {
          delta_link?: string | null
          last_synced_at?: string | null
          resource?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          custom_prompt: string
          id: string
          updated_at: string
        }
        Insert: {
          custom_prompt: string
          id: string
          updated_at?: string
        }
        Update: {
          custom_prompt?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_followups: {
        Row: {
          attempt_number: number
          created_at: string
          id: string
          last_error: string | null
          lead_id: string
          next_run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id: string
          next_run_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id?: string
          next_run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          last_path: string | null
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_path?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_path?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_product_access: {
        Row: {
          created_at: string
          id: string
          produto: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          produto: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          produto?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_audio: boolean | null
          lead_id: string | null
          message: string | null
          phone: string
          raw_data: Json | null
          timestamp: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          is_audio?: boolean | null
          lead_id?: string | null
          message?: string | null
          phone: string
          raw_data?: Json | null
          timestamp?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_audio?: boolean | null
          lead_id?: string | null
          message?: string | null
          phone?: string
          raw_data?: Json | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_actions: {
        Row: {
          action_label: string
          action_type: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
        }
        Insert: {
          action_label: string
          action_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
        }
        Update: {
          action_label?: string
          action_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      extract_internet_message_id: { Args: { p_raw: Json }; Returns: string }
      get_activity_actor: { Args: never; Returns: string }
      get_activity_source: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      infer_email_source: {
        Args: { p_row: Database["public"]["Tables"]["email_messages"]["Row"] }
        Returns: string
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_message_id: { Args: { p_id: string }; Returns: string }
      purge_old_unclassified_leads:
        | { Args: { p_older_than?: string }; Returns: Json }
        | { Args: { p_limit?: number; p_older_than?: string }; Returns: Json }
      purge_unclassified_lead: { Args: { p_lead_id: string }; Returns: Json }
      recompute_lead_message_cache: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      recompute_lead_whatsapp_cache: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      resolve_lead_ids_by_phone: {
        Args: { p_phone: string }
        Returns: string[]
      }
      set_activity_context: {
        Args: { p_actor?: string; p_source: string }
        Returns: undefined
      }
      user_can_access_lead: {
        Args: { _lead_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_produto: {
        Args: { _produto: string; _user_id: string }
        Returns: boolean
      }
      whatsapp_phone_variants: { Args: { p_phone: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      lead_status:
        | "em_negociacao"
        | "ganho"
        | "perdido"
        | "entregue"
        | "em_aberto"
        | "produzido"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      lead_status: [
        "em_negociacao",
        "ganho",
        "perdido",
        "entregue",
        "em_aberto",
        "produzido",
      ],
    },
  },
} as const
