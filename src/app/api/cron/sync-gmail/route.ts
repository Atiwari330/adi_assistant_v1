import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGmail } from "@/lib/integrations/gmail/sync";
import { loadFilterRules } from "@/lib/ingestion/filter";
import { runPipeline } from "@/lib/ai/pipeline";

/**
 * GET /api/cron/sync-gmail
 * Vercel Cron Job — runs every 5 minutes.
 * Syncs Gmail for all users with active Gmail connections.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();

  // Find all users with active Gmail connections
  const { data: connections } = await supabase
    .from("integration_connections")
    .select("user_id")
    .eq("provider", "gmail")
    .eq("is_active", true);

  if (!connections || connections.length === 0) {
    return Response.json({ status: "ok", message: "No active Gmail connections" });
  }

  const results: Array<{ userId: string; status: string; details?: unknown }> = [];

  for (const connection of connections) {
    const userId = connection.user_id;

    // Mark sync as running
    await supabase
      .from("sync_state")
      .update({ status: "running" as const, last_sync_started_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "gmail");

    try {
      const filterRules = await loadFilterRules(supabase, userId);
      const syncResult = await syncGmail(supabase, userId, filterRules);

      // Run LLM pipeline on newly ingested messages
      const pipelineResult = await runPipeline(supabase, userId);

      results.push({
        userId,
        status: "ok",
        details: { sync: syncResult, pipeline: pipelineResult },
      });
    } catch (err) {
      console.error(`Gmail sync failed for user ${userId}:`, err);

      // Update sync state with error
      await supabase
        .from("sync_state")
        .update({
          status: "error" as const,
          last_error: err instanceof Error ? err.message : "Unknown error",
          last_error_at: new Date().toISOString(),
          consecutive_errors: 1,
        })
        .eq("user_id", userId)
        .eq("provider", "gmail");

      results.push({
        userId,
        status: "error",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return Response.json({ status: "ok", results });
}
