import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/integrations/gmail/oauth";
import { AuthenticationError, errorResponse } from "@/lib/errors";

/**
 * POST /api/integrations/gmail/disconnect
 * Revokes Gmail tokens and removes the integration connection.
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

    // Get the stored connection
    const { data: connection } = await supabase
      .from("integration_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single();

    if (connection?.access_token) {
      // Try to revoke the token with Google (best-effort)
      try {
        const accessToken = decrypt<string>(connection.access_token);
        await revokeToken(accessToken);
      } catch {
        // Token may already be expired/revoked — that's fine
      }
    }

    // Delete the connection
    await supabase
      .from("integration_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "gmail");

    // Reset sync state
    await supabase
      .from("sync_state")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "gmail");

    return Response.json({ status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
