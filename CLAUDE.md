# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npx supabase db push # Push migrations to remote Supabase
npx supabase gen types --lang=typescript --project-id wlusojgyrjkmsbcylytn > src/types/database.ts  # Regenerate DB types
```

## Architecture

AI-powered work assistant that syncs Gmail and Slack, processes messages through Claude, and generates prioritized action items. Next.js 16 App Router, Supabase (Postgres + Auth + RLS), Vercel AI SDK v6, deployed on Vercel with cron jobs.

### Data Pipeline

```
Vercel Cron (every 5m)
  → /api/cron/sync-gmail, /api/cron/sync-slack
  → Sync services (src/lib/integrations/*/sync.ts)
    → Incremental fetch (Gmail historyId, Slack per-channel cursors)
    → Pre-LLM filtering (src/lib/ingestion/filter.ts)
    → Store in source_messages (status: pending)
  → LLM Pipeline (src/lib/ai/pipeline.ts)
    → Batch by thread, enrich with user context + rules
    → generateObject() with Zod schema (src/lib/ai/schemas.ts)
    → Store action_items + action_item_sources
```

### Three Supabase Clients

- **`src/lib/supabase/server.ts`** — cookie-based SSR client for API routes and Server Components (respects RLS)
- **`src/lib/supabase/client.ts`** — browser client for client components (respects RLS)
- **`src/lib/supabase/admin.ts`** — service role client that **bypasses RLS**, used only in cron jobs and background sync

### Auth Pattern

API routes authenticate via Supabase session. Cron routes authenticate via `Authorization: Bearer {CRON_SECRET}` header. Middleware (`src/middleware.ts`) refreshes sessions and protects routes.

### Key Directories

- `src/lib/ai/` — LLM pipeline: prompt building (`prompts.ts`), Zod output schema (`schemas.ts`), orchestrator (`pipeline.ts`)
- `src/lib/integrations/gmail/` — OAuth (`oauth.ts`), authenticated client (`client.ts`), incremental sync (`sync.ts`), MIME parser (`parser.ts`)
- `src/lib/integrations/slack/` — bot token client (`client.ts`), channel polling sync (`sync.ts`)
- `src/lib/ingestion/filter.ts` — pre-LLM filtering (exclude domains/addresses/channels, saves tokens)
- `src/lib/crypto.ts` — AES-256-GCM encryption for stored OAuth tokens
- `supabase/migrations/` — full schema (10 tables, RLS on all, triggers for updated_at and audit trail)

### Database

10 tables with RLS. Key ones: `source_messages` (raw ingested messages), `action_items` (AI-generated to-dos), `filter_rules` (pre-LLM exclusions), `processing_rules` (per-sender LLM instructions), `contacts` (delegation targets). All JSONB fields use the `Json` type from `src/types/database.ts`. The `action_item_history` table auto-populates via a trigger on `action_items` status changes.

### Important Type Patterns

- Supabase `select("*")` returns `{}` with this version — always use explicit column selection: `select("id, title, status")`
- JSONB fields must be cast as `Json` type (not `Record<string, unknown>`) when inserting/updating
- Zod v4: use `parsed.error.message` (not `.errors.map()`), `z.record(z.string(), z.unknown())` requires two args
- AI SDK v6: usage fields are `usage.inputTokens` / `usage.outputTokens` (not `promptTokens`)

### Initial Sync Lookback

First-time syncs are limited to `INITIAL_SYNC_LOOKBACK_DAYS` (7 days) in `src/lib/constants.ts` to prevent processing stale historical messages. Subsequent syncs are incremental via cursors.

## How to Add a New Integration

Follow the Gmail/Slack pattern: create `src/lib/integrations/<name>/client.ts` (authenticated API client), `sync.ts` (incremental data fetch), and optionally `oauth.ts`. Add connect/disconnect/callback routes under `src/app/api/integrations/<name>/`. Add the provider to the `integration_provider` enum in a new migration. Store tokens encrypted via `src/lib/crypto.ts` in `integration_connections`. Add a sync cron route and register it in `vercel.json`. The sync should write to `source_messages` with `processing_status: 'pending'` — the existing LLM pipeline picks them up automatically.

## How to Modify AI Behavior

- **Change what the AI knows about the user:** Edit `user_profiles` via `/api/user-context` or directly in Supabase. Fields like `role_description`, `team_structure`, and `work_preferences` are injected into every prompt by `src/lib/ai/prompts.ts`.
- **Change how specific senders are handled:** Add `processing_rules` — these inject per-sender instructions into the LLM prompt and can override priority.
- **Change what gets filtered before the LLM sees it:** Add `filter_rules` or modify `DEFAULT_EXCLUDED_SENDERS` in `src/lib/constants.ts`.
- **Change action item structure:** Modify the Zod schema in `src/lib/ai/schemas.ts` and update the pipeline in `pipeline.ts` to handle new fields. Update the `action_items` table via a new migration.
- **Change the model:** Edit `src/lib/ai/provider.ts`. The pipeline uses `generateObject()` which requires a model that supports structured output.

## Gotchas

- Gmail OAuth requires the redirect URI in Google Cloud Console to exactly match `{NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`. When deploying to a new domain, this must be updated in Google Cloud.
- The middleware file shows a deprecation warning about "proxy" convention — this is a Next.js 16 warning and can be ignored for now.
- All frontend pages under `src/app/(app)/` are client components. The layout handles sync, auth, and navigation.
- `source_messages` has a unique constraint on `(user_id, source, external_id)` — duplicate inserts return error code `23505` which the sync services handle gracefully.
- Cron jobs on Vercel Hobby plan are limited to 2. Both slots are used (sync-gmail, sync-slack). To add more crons, upgrade to Pro or combine logic into a single cron route.

## Feedback Loop (Dev Workflow)

In-app feedback on action items for continuous system improvement. Users leave feedback on the detail page (`/items/[id]`) categorizing what the AI got wrong (priority, delegation, missing context, etc.). Feedback is stored in `action_item_feedback` table.

**Developer review endpoint:** `GET /api/dev/feedback-review` returns unresolved feedback bundled with full context (action item, source messages, current system prompt, category counts). Auth: `Authorization: Bearer {FEEDBACK_REVIEW_SECRET}`. Also supports `PATCH` with `{ ids: [...] }` to mark feedback as resolved. Query params: `limit`, `resolved`, `category`.

**Workflow:** Review feedback → identify patterns in `category_counts` → refine system prompt in `src/lib/ai/prompts.ts` or add `processing_rules` → mark feedback resolved.

Key files: `src/app/api/dev/feedback-review/route.ts`, `src/app/api/action-items/[id]/feedback/route.ts`, feedback UI in `src/app/(app)/items/[id]/page.tsx`.

## Environment Variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY` (64 hex chars), `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`. Optional: `FEEDBACK_REVIEW_SECRET` (for dev feedback review endpoint). See `.env.example` for docs. `CRON_SECRET` is auto-set by Vercel.
