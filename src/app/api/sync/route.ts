import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGmail } from "@/lib/integrations/gmail/sync";
import { syncSlack } from "@/lib/integrations/slack/sync";
import { loadFilterRules } from "@/lib/ingestion/filter";
import { runPipeline } from "@/lib/ai/pipeline";
import { errorResponse, AuthenticationError, AppError } from "@/lib/errors";
import { MANUAL_SYNC_COOLDOWN_SECONDS } from "@/lib/constants";

/**
 * POST /api/sync
 * Manual sync trigger — runs Gmail + Slack sync for the current user.
 * Has a cooldown to prevent rapid-fire requests.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    // Use admin client for the actual sync (needs to bypass RLS for service-level operations)
    const adminSupabase = createAdminClient();

    // Check cooldown
    const { data: syncStates } = await adminSupabase
      .from("sync_state")
      .select("provider, last_sync_completed_at")
      .eq("user_id", user.id);

    const now = Date.now();
    for (const state of syncStates ?? []) {
      if (state.last_sync_completed_at) {
        const elapsed = now - new Date(state.last_sync_completed_at).getTime();
        if (elapsed < MANUAL_SYNC_COOLDOWN_SECONDS * 1000) {
          throw new AppError(
            `Please wait ${MANUAL_SYNC_COOLDOWN_SECONDS} seconds between syncs`,
            "COOLDOWN",
            429,
          );
        }
      }
    }

    // Load filter rules
    const filterRules = await loadFilterRules(adminSupabase, user.id);

    // Check which integrations are connected
    const { data: connections } = await adminSupabase
      .from("integration_connections")
      .select("provider")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const providers = new Set((connections ?? []).map((c) => c.provider));

    let gmailResult = null;
    let slackResult = null;

    // Sync Gmail if connected
    if (providers.has("gmail")) {
      await adminSupabase
        .from("sync_state")
        .update({ status: "running" as const, last_sync_started_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("provider", "gmail");

      try {
        gmailResult = await syncGmail(adminSupabase, user.id, filterRules);
      } catch (err) {
        console.error("Manual Gmail sync failed:", err);
        gmailResult = { error: err instanceof Error ? err.message : "Unknown error" };
      }
    }

    // Sync Slack if connected
    if (providers.has("slack")) {
      await adminSupabase
        .from("sync_state")
        .update({ status: "running" as const, last_sync_started_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("provider", "slack");

      try {
        slackResult = await syncSlack(adminSupabase, user.id, filterRules);
      } catch (err) {
        console.error("Manual Slack sync failed:", err);
        slackResult = { error: err instanceof Error ? err.message : "Unknown error" };
      }
    }

    // Run LLM pipeline on any newly ingested messages
    let pipelineResult = null;
    try {
      pipelineResult = await runPipeline(adminSupabase, user.id);
    } catch (err) {
      console.error("Pipeline failed during manual sync:", err);
      pipelineResult = { error: err instanceof Error ? err.message : "Unknown error" };
    }

    return Response.json({
      status: "ok",
      gmail: gmailResult,
      slack: slackResult,
      pipeline: pipelineResult,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
