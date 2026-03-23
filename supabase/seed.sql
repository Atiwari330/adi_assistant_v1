-- =============================================================================
-- Seed Data for Development
-- =============================================================================
-- NOTE: This seed file assumes a user already exists in auth.users.
-- The handle_new_user trigger will auto-create the user_profiles row.
-- These seeds populate filter rules and sample contacts that will be
-- associated with the first user who signs up.
--
-- For local dev, you can create a user via Supabase dashboard or API,
-- then run: supabase db reset (which re-applies migrations + seed)
-- =============================================================================

-- We use a function so seeds can reference the first user dynamically.
-- In production, these defaults are created via the app's onboarding flow.

DO $$
DECLARE
  _user_id UUID;
BEGIN
  -- Get the first user (if any exist)
  SELECT id INTO _user_id FROM auth.users LIMIT 1;

  -- Only seed if a user exists
  IF _user_id IS NULL THEN
    RAISE NOTICE 'No users found — skipping seed data. Create a user first, then run supabase db reset.';
    RETURN;
  END IF;

  -- =========================================================================
  -- Default Filter Rules (pre-LLM exclusions to save tokens)
  -- =========================================================================

  INSERT INTO public.filter_rules (user_id, rule_type, pattern, description) VALUES
    (_user_id, 'exclude_address', 'noreply@', 'Skip all noreply senders'),
    (_user_id, 'exclude_address', 'no-reply@', 'Skip all no-reply senders'),
    (_user_id, 'exclude_address', 'notifications@', 'Skip notification emails'),
    (_user_id, 'exclude_address', 'mailer-daemon@', 'Skip bounce-back emails'),
    (_user_id, 'exclude_address', 'postmaster@', 'Skip postmaster emails'),
    (_user_id, 'exclude_domain', 'calendar-notification.google.com', 'Skip Google Calendar notifications'),
    (_user_id, 'exclude_domain', 'docs.google.com', 'Skip Google Docs notifications')
  ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- Update user profile with Adi's context
  -- =========================================================================

  UPDATE public.user_profiles
  SET
    job_title = 'Vice President of Revenue Operations',
    role_description = 'I lead the revenue operations team. My responsibilities include managing customer success, sales enablement, CRM administration, and cross-functional operational initiatives. I make decisions on team resource allocation, approve spend requests, and handle escalated customer issues.',
    company_name = '',
    company_description = '',
    team_structure = '',
    work_preferences = jsonb_build_object(
      'timezone', 'America/New_York',
      'communication_style', 'concise and action-oriented',
      'delegation_preference', 'Delegate operational and customer-facing tasks to team members. Keep strategic decisions.'
    )
  WHERE user_id = _user_id;

  -- =========================================================================
  -- Initialize sync state rows (one per provider)
  -- =========================================================================

  INSERT INTO public.sync_state (user_id, provider, status) VALUES
    (_user_id, 'gmail', 'idle'),
    (_user_id, 'slack', 'idle')
  ON CONFLICT (user_id, provider) DO NOTHING;

END;
$$;
