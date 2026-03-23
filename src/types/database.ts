/**
 * Supabase Database Types
 *
 * Hand-written to match the migration at:
 *   supabase/migrations/20260321000000_initial_schema.sql
 *
 * Once a live Supabase project is connected, regenerate with:
 *   npx supabase gen types --lang=typescript --project-id <ref> > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string | null;
          job_title: string | null;
          role_description: string | null;
          company_name: string | null;
          company_description: string | null;
          team_structure: string | null;
          work_preferences: Json;
          system_prompt_override: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string | null;
          job_title?: string | null;
          role_description?: string | null;
          company_name?: string | null;
          company_description?: string | null;
          team_structure?: string | null;
          work_preferences?: Json;
          system_prompt_override?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string | null;
          job_title?: string | null;
          role_description?: string | null;
          company_name?: string | null;
          company_description?: string | null;
          team_structure?: string | null;
          work_preferences?: Json;
          system_prompt_override?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      integration_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          is_active: boolean;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          scopes: string[] | null;
          provider_metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          is_active?: boolean;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          scopes?: string[] | null;
          provider_metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          is_active?: boolean;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          scopes?: string[] | null;
          provider_metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      sync_state: {
        Row: {
          id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          status: Database["public"]["Enums"]["sync_status"];
          last_sync_started_at: string | null;
          last_sync_completed_at: string | null;
          last_error: string | null;
          last_error_at: string | null;
          consecutive_errors: number;
          cursor_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          status?: Database["public"]["Enums"]["sync_status"];
          last_sync_started_at?: string | null;
          last_sync_completed_at?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          consecutive_errors?: number;
          cursor_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          status?: Database["public"]["Enums"]["sync_status"];
          last_sync_started_at?: string | null;
          last_sync_completed_at?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          consecutive_errors?: number;
          cursor_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_state_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      contacts: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string | null;
          slack_user_id: string | null;
          job_title: string | null;
          organization: string | null;
          relationship: Database["public"]["Enums"]["contact_relationship"];
          is_delegate: boolean;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email?: string | null;
          slack_user_id?: string | null;
          job_title?: string | null;
          organization?: string | null;
          relationship?: Database["public"]["Enums"]["contact_relationship"];
          is_delegate?: boolean;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          email?: string | null;
          slack_user_id?: string | null;
          job_title?: string | null;
          organization?: string | null;
          relationship?: Database["public"]["Enums"]["contact_relationship"];
          is_delegate?: boolean;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      filter_rules: {
        Row: {
          id: string;
          user_id: string;
          rule_type: Database["public"]["Enums"]["filter_rule_type"];
          pattern: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          rule_type: Database["public"]["Enums"]["filter_rule_type"];
          pattern: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          rule_type?: Database["public"]["Enums"]["filter_rule_type"];
          pattern?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "filter_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      processing_rules: {
        Row: {
          id: string;
          user_id: string;
          match_type: Database["public"]["Enums"]["rule_match_type"];
          match_value: string;
          priority_override: Database["public"]["Enums"]["priority_level"] | null;
          delegate_to: string | null;
          instruction_text: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          match_type: Database["public"]["Enums"]["rule_match_type"];
          match_value: string;
          priority_override?: Database["public"]["Enums"]["priority_level"] | null;
          delegate_to?: string | null;
          instruction_text?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          match_type?: Database["public"]["Enums"]["rule_match_type"];
          match_value?: string;
          priority_override?: Database["public"]["Enums"]["priority_level"] | null;
          delegate_to?: string | null;
          instruction_text?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "processing_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_rules_delegate_to_fkey";
            columns: ["delegate_to"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };

      source_messages: {
        Row: {
          id: string;
          user_id: string;
          source: Database["public"]["Enums"]["source_type"];
          external_id: string;
          thread_id: string | null;
          sender_address: string | null;
          sender_name: string | null;
          recipients: Json | null;
          channel_id: string | null;
          channel_name: string | null;
          subject: string | null;
          body_text: string | null;
          body_html: string | null;
          has_attachments: boolean;
          message_timestamp: string;
          raw_metadata: Json;
          processing_status: Database["public"]["Enums"]["processing_status"];
          filtered_by_rule_id: string | null;
          processing_error: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: Database["public"]["Enums"]["source_type"];
          external_id: string;
          thread_id?: string | null;
          sender_address?: string | null;
          sender_name?: string | null;
          recipients?: Json | null;
          channel_id?: string | null;
          channel_name?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          has_attachments?: boolean;
          message_timestamp: string;
          raw_metadata?: Json;
          processing_status?: Database["public"]["Enums"]["processing_status"];
          filtered_by_rule_id?: string | null;
          processing_error?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: Database["public"]["Enums"]["source_type"];
          external_id?: string;
          thread_id?: string | null;
          sender_address?: string | null;
          sender_name?: string | null;
          recipients?: Json | null;
          channel_id?: string | null;
          channel_name?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          has_attachments?: boolean;
          message_timestamp?: string;
          raw_metadata?: Json;
          processing_status?: Database["public"]["Enums"]["processing_status"];
          filtered_by_rule_id?: string | null;
          processing_error?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_messages_filtered_by_rule_id_fkey";
            columns: ["filtered_by_rule_id"];
            isOneToOne: false;
            referencedRelation: "filter_rules";
            referencedColumns: ["id"];
          },
        ];
      };

      action_items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          summary: string | null;
          action_type: Database["public"]["Enums"]["action_type"];
          priority: Database["public"]["Enums"]["priority_level"];
          status: Database["public"]["Enums"]["action_status"];
          suggested_delegate: string | null;
          delegate_reason: string | null;
          ai_reasoning: string | null;
          due_date: string | null;
          snoozed_until: string | null;
          llm_model: string | null;
          llm_prompt_tokens: number | null;
          llm_completion_tokens: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          summary?: string | null;
          action_type: Database["public"]["Enums"]["action_type"];
          priority?: Database["public"]["Enums"]["priority_level"];
          status?: Database["public"]["Enums"]["action_status"];
          suggested_delegate?: string | null;
          delegate_reason?: string | null;
          ai_reasoning?: string | null;
          due_date?: string | null;
          snoozed_until?: string | null;
          llm_model?: string | null;
          llm_prompt_tokens?: number | null;
          llm_completion_tokens?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          summary?: string | null;
          action_type?: Database["public"]["Enums"]["action_type"];
          priority?: Database["public"]["Enums"]["priority_level"];
          status?: Database["public"]["Enums"]["action_status"];
          suggested_delegate?: string | null;
          delegate_reason?: string | null;
          ai_reasoning?: string | null;
          due_date?: string | null;
          snoozed_until?: string | null;
          llm_model?: string | null;
          llm_prompt_tokens?: number | null;
          llm_completion_tokens?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_suggested_delegate_fkey";
            columns: ["suggested_delegate"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };

      action_item_sources: {
        Row: {
          id: string;
          action_item_id: string;
          source_message_id: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_item_id: string;
          source_message_id: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_item_id?: string;
          source_message_id?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_item_sources_action_item_id_fkey";
            columns: ["action_item_id"];
            isOneToOne: false;
            referencedRelation: "action_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_item_sources_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "source_messages";
            referencedColumns: ["id"];
          },
        ];
      };

      action_item_history: {
        Row: {
          id: string;
          action_item_id: string;
          user_id: string;
          previous_status: Database["public"]["Enums"]["action_status"] | null;
          new_status: Database["public"]["Enums"]["action_status"];
          changed_fields: Json | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_item_id: string;
          user_id: string;
          previous_status?: Database["public"]["Enums"]["action_status"] | null;
          new_status: Database["public"]["Enums"]["action_status"];
          changed_fields?: Json | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_item_id?: string;
          user_id?: string;
          previous_status?: Database["public"]["Enums"]["action_status"] | null;
          new_status?: Database["public"]["Enums"]["action_status"];
          changed_fields?: Json | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_item_history_action_item_id_fkey";
            columns: ["action_item_id"];
            isOneToOne: false;
            referencedRelation: "action_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_item_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;

    Enums: {
      source_type: "email" | "slack";
      processing_status: "pending" | "processing" | "processed" | "skipped" | "error";
      action_type:
        | "respond"
        | "delegate"
        | "approve"
        | "reject"
        | "review"
        | "follow_up"
        | "schedule"
        | "archive"
        | "info_only";
      priority_level: "critical" | "high" | "medium" | "low" | "info";
      action_status: "new" | "read" | "acknowledged" | "in_progress" | "done" | "dismissed";
      integration_provider: "gmail" | "slack";
      sync_status: "idle" | "running" | "error";
      contact_relationship:
        | "team_member"
        | "direct_report"
        | "manager"
        | "executive"
        | "customer"
        | "vendor"
        | "partner"
        | "other";
      filter_rule_type: "exclude_domain" | "exclude_address" | "exclude_channel";
      rule_match_type: "email_address" | "email_domain" | "slack_user_id" | "slack_channel";
    };

    CompositeTypes: Record<string, never>;
  };
};

// =============================================================================
// Convenience type helpers
// =============================================================================

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

/** Row types (what you get back from SELECT) */
export type UserProfile = Tables["user_profiles"]["Row"];
export type IntegrationConnection = Tables["integration_connections"]["Row"];
export type SyncState = Tables["sync_state"]["Row"];
export type Contact = Tables["contacts"]["Row"];
export type FilterRule = Tables["filter_rules"]["Row"];
export type ProcessingRule = Tables["processing_rules"]["Row"];
export type SourceMessage = Tables["source_messages"]["Row"];
export type ActionItem = Tables["action_items"]["Row"];
export type ActionItemSource = Tables["action_item_sources"]["Row"];
export type ActionItemHistory = Tables["action_item_history"]["Row"];

/** Insert types (what you pass to INSERT) */
export type UserProfileInsert = Tables["user_profiles"]["Insert"];
export type IntegrationConnectionInsert = Tables["integration_connections"]["Insert"];
export type SyncStateInsert = Tables["sync_state"]["Insert"];
export type ContactInsert = Tables["contacts"]["Insert"];
export type FilterRuleInsert = Tables["filter_rules"]["Insert"];
export type ProcessingRuleInsert = Tables["processing_rules"]["Insert"];
export type SourceMessageInsert = Tables["source_messages"]["Insert"];
export type ActionItemInsert = Tables["action_items"]["Insert"];
export type ActionItemSourceInsert = Tables["action_item_sources"]["Insert"];

/** Update types (what you pass to UPDATE) */
export type ActionItemUpdate = Tables["action_items"]["Update"];
export type ContactUpdate = Tables["contacts"]["Update"];
export type UserProfileUpdate = Tables["user_profiles"]["Update"];
export type FilterRuleUpdate = Tables["filter_rules"]["Update"];
export type ProcessingRuleUpdate = Tables["processing_rules"]["Update"];

/** Enum types */
export type SourceType = Enums["source_type"];
export type ProcessingStatus = Enums["processing_status"];
export type ActionType = Enums["action_type"];
export type PriorityLevel = Enums["priority_level"];
export type ActionStatus = Enums["action_status"];
export type IntegrationProvider = Enums["integration_provider"];
export type SyncStatusType = Enums["sync_status"];
export type ContactRelationship = Enums["contact_relationship"];
export type FilterRuleType = Enums["filter_rule_type"];
export type RuleMatchType = Enums["rule_match_type"];
