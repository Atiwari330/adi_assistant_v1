import { createClient } from "@/lib/supabase/server";
import { AuthenticationError, errorResponse } from "@/lib/errors";

/**
 * POST /api/integrations/slack/disconnect
 * Removes the Slack bot token and resets sync state.
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

    // Delete the connection
    await supabase
      .from("integration_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "slack");

    // Reset sync state
    await supabase
      .from("sync_state")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "slack");

    return Response.json({ status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
