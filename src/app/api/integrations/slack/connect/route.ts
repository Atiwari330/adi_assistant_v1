import { createClient } from "@/lib/supabase/server";
import { validateSlackToken } from "@/lib/integrations/slack/client";
import { encrypt } from "@/lib/crypto";
import { AuthenticationError, ValidationError, errorResponse } from "@/lib/errors";

/**
 * POST /api/integrations/slack/connect
 * Accepts a Slack bot token, validates it, encrypts it, and stores it.
 *
 * Body: { botToken: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const body = await request.json();
    const botToken = body?.botToken;

    if (!botToken || typeof botToken !== "string") {
      throw new ValidationError("botToken is required");
    }

    if (!botToken.startsWith("xoxb-")) {
      throw new ValidationError(
        "Invalid Slack bot token format. Token should start with 'xoxb-'",
      );
    }

    // Validate the token with Slack
    const workspaceInfo = await validateSlackToken(botToken);

    // Encrypt and store
    const encryptedToken = encrypt(botToken);

    const { error: dbError } = await supabase
      .from("integration_connections")
      .upsert(
        {
          user_id: user.id,
          provider: "slack" as const,
          is_active: true,
          access_token: encryptedToken,
          refresh_token: null, // Bot tokens don't have refresh tokens
          token_expires_at: null, // Bot tokens don't expire
          scopes: [], // Scopes are set on the Slack app, not per-token
          provider_metadata: {
            team_id: workspaceInfo.teamId,
            team_name: workspaceInfo.teamName,
            bot_user_id: workspaceInfo.botUserId,
            connected_at: new Date().toISOString(),
          },
        },
        { onConflict: "user_id,provider" },
      );

    if (dbError) {
      console.error("Failed to store Slack token:", dbError);
      return Response.json(
        { error: "Failed to store connection", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Initialize sync state for Slack
    await supabase.from("sync_state").upsert(
      {
        user_id: user.id,
        provider: "slack" as const,
        status: "idle" as const,
        cursor_data: {},
      },
      { onConflict: "user_id,provider" },
    );

    return Response.json({
      status: "ok",
      workspace: workspaceInfo.teamName,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
