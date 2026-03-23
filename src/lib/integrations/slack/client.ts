import { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { decrypt } from "@/lib/crypto";
import { IntegrationError } from "@/lib/errors";

/**
 * Validate a Slack bot token by calling auth.test.
 * Returns workspace info on success.
 */
export async function validateSlackToken(botToken: string) {
  const client = new WebClient(botToken);
  const result = await client.auth.test();

  if (!result.ok) {
    throw new IntegrationError("Slack", "Token validation failed");
  }

  return {
    teamId: result.team_id,
    teamName: result.team,
    botUserId: result.user_id,
    botId: result.bot_id,
  };
}

/**
 * Get an authenticated Slack WebClient for a user.
 * Fetches and decrypts the stored bot token.
 */
export async function getSlackClient(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WebClient> {
  const { data: connection, error } = await supabase
    .from("integration_connections")
    .select("is_active, access_token")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .single();

  if (error || !connection) {
    throw new IntegrationError("Slack", "Not connected");
  }

  if (!connection.is_active) {
    throw new IntegrationError("Slack", "Connection is inactive");
  }

  if (!connection.access_token) {
    throw new IntegrationError("Slack", "Missing bot token");
  }

  const botToken = decrypt<string>(connection.access_token);
  return new WebClient(botToken);
}
