import { google, type gmail_v1 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { decrypt, encrypt } from "@/lib/crypto";
import { createOAuth2Client } from "./oauth";
import { IntegrationError } from "@/lib/errors";

interface GmailClientResult {
  gmail: gmail_v1.Gmail;
}

/**
 * Get an authenticated Gmail client for a user.
 * Handles token decryption and automatic refresh if expired.
 * Updates the DB with new tokens after refresh.
 */
export async function getGmailClient(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GmailClientResult> {
  // Fetch the stored connection
  const { data: connection, error } = await supabase
    .from("integration_connections")
    .select("id, is_active, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .single();

  if (error || !connection) {
    throw new IntegrationError("Gmail", "Not connected");
  }

  if (!connection.is_active) {
    throw new IntegrationError("Gmail", "Connection is inactive");
  }

  if (!connection.access_token || !connection.refresh_token) {
    throw new IntegrationError("Gmail", "Missing tokens");
  }

  // Decrypt tokens
  const accessToken = decrypt<string>(connection.access_token);
  const refreshToken = decrypt<string>(connection.refresh_token);

  // Build OAuth2 client
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : undefined,
  });

  // Listen for token refresh events and persist new tokens
  oauth2Client.on("tokens", async (newTokens) => {
    const updates: Record<string, unknown> = {};

    if (newTokens.access_token) {
      updates.access_token = encrypt(newTokens.access_token);
    }
    if (newTokens.refresh_token) {
      updates.refresh_token = encrypt(newTokens.refresh_token);
    }
    if (newTokens.expiry_date) {
      updates.token_expires_at = new Date(newTokens.expiry_date).toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("integration_connections")
        .update(updates)
        .eq("id", connection.id);
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  return { gmail };
}
