-- =============================================================================
-- Adi Assistant — Initial Database Schema
-- =============================================================================
-- This migration creates the complete schema for the AI work assistant:
--   - 10 enum types
--   - 10 tables with full constraints
--   - Row Level Security on every table
--   - Indexes for all key query patterns
--   - Triggers for updated_at and action item audit trail
--   - Realtime publication for action_items
-- =============================================================================

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Source of ingested messages
CREATE TYPE public.source_type AS ENUM ('email', 'slack');

-- Processing pipeline status for raw messages
CREATE TYPE public.processing_status AS ENUM (
  'pending',
  'processing',
  'processed',
  'skipped',
  'error'
);

-- What the AI suggests doing
CREATE TYPE public.action_type AS ENUM (
  'respond',
  'delegate',
  'approve',
  'reject',
  'review',
  'follow_up',
  'schedule',
  'archive',
  'info_only'
);

-- Priority levels (ordered: critical sorts first in ORDER BY)
CREATE TYPE public.priority_level AS ENUM (
  'critical',
  'high',
  'medium',
  'low',
  'info'
);

-- Lifecycle of an action item
CREATE TYPE public.action_status AS ENUM (
  'new',
  'read',
  'acknowledged',
  'in_progress',
  'done',
  'dismissed'
);

-- Integration provider
CREATE TYPE public.integration_provider AS ENUM ('gmail', 'slack');

-- Sync job status
CREATE TYPE public.sync_status AS ENUM ('idle', 'running', 'error');

-- Relationship of a contact to the user
CREATE TYPE public.contact_relationship AS ENUM (
  'team_member',
  'direct_report',
  'manager',
  'executive',
  'customer',
  'vendor',
  'partner',
  'other'
);

-- What kind of filtering rule
CREATE TYPE public.filter_rule_type AS ENUM (
  'exclude_domain',
  'exclude_address',
  'exclude_channel'
);

-- Scope for priority/delegation rules
CREATE TYPE public.rule_match_type AS ENUM (
  'email_address',
  'email_domain',
  'slack_user_id',
  'slack_channel'
);


-- =============================================================================
-- FUNCTIONS (before tables, so triggers can reference them)
-- =============================================================================

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-log action item status changes to audit trail
CREATE OR REPLACE FUNCTION public.log_action_item_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.action_item_history (
      action_item_id,
      user_id,
      previous_status,
      new_status
    ) VALUES (
      NEW.id,
      NEW.user_id,
      OLD.status,
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- TABLE 1: user_profiles
-- =============================================================================
-- User's context injected into every LLM prompt. 1:1 with auth.users.

CREATE TABLE public.user_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  job_title       TEXT,
  role_description TEXT,
  company_name    TEXT,
  company_description TEXT,
  team_structure  TEXT,
  work_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  system_prompt_override TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile"
  ON public.user_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 2: integration_connections
-- =============================================================================
-- OAuth credentials and connection state per provider.

CREATE TABLE public.integration_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          public.integration_provider NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  scopes            TEXT[],
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, provider)
);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations"
  ON public.integration_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_integration_connections_user_provider
  ON public.integration_connections (user_id, provider);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 3: sync_state
-- =============================================================================
-- Tracks polling state per integration for incremental sync.

CREATE TABLE public.sync_state (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                public.integration_provider NOT NULL,
  status                  public.sync_status NOT NULL DEFAULT 'idle',
  last_sync_started_at    TIMESTAMPTZ,
  last_sync_completed_at  TIMESTAMPTZ,
  last_error              TEXT,
  last_error_at           TIMESTAMPTZ,
  consecutive_errors      INT NOT NULL DEFAULT 0,
  cursor_data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, provider)
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sync state"
  ON public.sync_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 4: contacts
-- =============================================================================
-- Directory of known people for delegation suggestions and context.

CREATE TABLE public.contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           TEXT,
  slack_user_id   TEXT,
  job_title       TEXT,
  organization    TEXT,
  relationship    public.contact_relationship NOT NULL DEFAULT 'other',
  is_delegate     BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contacts"
  ON public.contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contacts_user_id
  ON public.contacts (user_id);

CREATE INDEX idx_contacts_email
  ON public.contacts (user_id, email);

CREATE INDEX idx_contacts_slack_user_id
  ON public.contacts (user_id, slack_user_id);

CREATE INDEX idx_contacts_relationship
  ON public.contacts (user_id, relationship);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 5: filter_rules
-- =============================================================================
-- Exclusion rules checked BEFORE sending to the LLM to save tokens.

CREATE TABLE public.filter_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type   public.filter_rule_type NOT NULL,
  pattern     TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.filter_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own filter rules"
  ON public.filter_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_filter_rules_user_active
  ON public.filter_rules (user_id)
  WHERE is_active = true;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.filter_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 6: processing_rules
-- =============================================================================
-- Per-person/per-domain instructions injected into LLM prompts.

CREATE TABLE public.processing_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_type        public.rule_match_type NOT NULL,
  match_value       TEXT NOT NULL,
  priority_override public.priority_level,
  delegate_to       UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  instruction_text  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.processing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own processing rules"
  ON public.processing_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_processing_rules_user_active
  ON public.processing_rules (user_id)
  WHERE is_active = true;

CREATE INDEX idx_processing_rules_match
  ON public.processing_rules (user_id, match_type, match_value)
  WHERE is_active = true;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.processing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 7: source_messages
-- =============================================================================
-- Raw ingested emails and Slack messages. Highest-volume table.

CREATE TABLE public.source_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source              public.source_type NOT NULL,
  external_id         TEXT NOT NULL,
  thread_id           TEXT,
  sender_address      TEXT,
  sender_name         TEXT,
  recipients          JSONB,
  channel_id          TEXT,
  channel_name        TEXT,
  subject             TEXT,
  body_text           TEXT,
  body_html           TEXT,
  has_attachments     BOOLEAN NOT NULL DEFAULT false,
  message_timestamp   TIMESTAMPTZ NOT NULL,
  raw_metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status   public.processing_status NOT NULL DEFAULT 'pending',
  filtered_by_rule_id UUID REFERENCES public.filter_rules(id) ON DELETE SET NULL,
  processing_error    TEXT,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, source, external_id)
);

ALTER TABLE public.source_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own messages"
  ON public.source_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Unprocessed messages for the sync worker
CREATE INDEX idx_source_messages_pending
  ON public.source_messages (user_id, processing_status)
  WHERE processing_status = 'pending';

-- Lookup by thread for conversation context
CREATE INDEX idx_source_messages_thread
  ON public.source_messages (user_id, source, thread_id);

-- Chronological listing
CREATE INDEX idx_source_messages_timestamp
  ON public.source_messages (user_id, message_timestamp DESC);

-- Filter rule matching during ingest
CREATE INDEX idx_source_messages_sender
  ON public.source_messages (user_id, sender_address);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.source_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- TABLE 8: action_items
-- =============================================================================
-- AI-generated to-do items — the core of the user experience.

CREATE TABLE public.action_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  summary                 TEXT,
  action_type             public.action_type NOT NULL,
  priority                public.priority_level NOT NULL DEFAULT 'medium',
  status                  public.action_status NOT NULL DEFAULT 'new',
  suggested_delegate      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  delegate_reason         TEXT,
  ai_reasoning            TEXT,
  due_date                DATE,
  snoozed_until           TIMESTAMPTZ,
  llm_model               TEXT,
  llm_prompt_tokens       INT,
  llm_completion_tokens   INT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own action items"
  ON public.action_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- THE key query: unread items sorted by priority
CREATE INDEX idx_action_items_active
  ON public.action_items (user_id, priority, created_at DESC)
  WHERE status IN ('new', 'read');

-- Today's items
CREATE INDEX idx_action_items_created
  ON public.action_items (user_id, created_at DESC);

-- History browsing (completed/dismissed)
CREATE INDEX idx_action_items_done
  ON public.action_items (user_id, updated_at DESC)
  WHERE status IN ('done', 'dismissed');

-- Status filtering
CREATE INDEX idx_action_items_status
  ON public.action_items (user_id, status);

-- Snoozed items that need to resurface
CREATE INDEX idx_action_items_snoozed
  ON public.action_items (snoozed_until)
  WHERE snoozed_until IS NOT NULL AND status NOT IN ('done', 'dismissed');

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER action_item_status_audit
  AFTER UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.log_action_item_status_change();


-- =============================================================================
-- TABLE 9: action_item_sources
-- =============================================================================
-- Join table: action items <-> source messages (many-to-many).

CREATE TABLE public.action_item_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id    UUID NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  source_message_id UUID NOT NULL REFERENCES public.source_messages(id) ON DELETE CASCADE,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (action_item_id, source_message_id)
);

ALTER TABLE public.action_item_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own action item sources"
  ON public.action_item_sources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.action_items ai
      WHERE ai.id = action_item_sources.action_item_id
        AND ai.user_id = auth.uid()
    )
  );

CREATE INDEX idx_action_item_sources_action
  ON public.action_item_sources (action_item_id);

CREATE INDEX idx_action_item_sources_message
  ON public.action_item_sources (source_message_id);


-- =============================================================================
-- TABLE 10: action_item_history
-- =============================================================================
-- Audit trail of every status change on an action item.

CREATE TABLE public.action_item_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id  UUID NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status public.action_status,
  new_status      public.action_status NOT NULL,
  changed_fields  JSONB,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.action_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own history"
  ON public.action_item_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_action_item_history_item
  ON public.action_item_history (action_item_id, created_at DESC);

CREATE INDEX idx_action_item_history_user_time
  ON public.action_item_history (user_id, created_at DESC);


-- =============================================================================
-- AUTH TRIGGER
-- =============================================================================
-- Auto-create user_profiles row when a new user signs up.

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- REALTIME
-- =============================================================================
-- Enable realtime subscriptions on action_items for instant UI updates.

ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
