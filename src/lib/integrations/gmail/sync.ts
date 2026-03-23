import type { gmail_v1 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FilterRule, Json } from "@/types/database";
import { getGmailClient } from "./client";
import { parseGmailMessage } from "./parser";
import { checkEmailFilter } from "@/lib/ingestion/filter";
import { INITIAL_SYNC_LOOKBACK_DAYS } from "@/lib/constants";

interface GmailSyncResult {
  newMessages: number;
  skippedByFilter: number;
  errors: number;
}

/**
 * Perform an incremental Gmail sync for a user.
 *
 * Flow:
 * 1. Get stored historyId from sync_state
 * 2. If no historyId, do initial sync (fetch recent messages)
 * 3. If historyId exists, use history.list for incremental sync
 * 4. For each new message: parse, filter, store
 * 5. Update sync_state cursor
 */
export async function syncGmail(
  supabase: SupabaseClient<Database>,
  userId: string,
  filterRules: FilterRule[],
): Promise<GmailSyncResult> {
  const { gmail } = await getGmailClient(supabase, userId);

  // Get current sync cursor
  const { data: syncState } = await supabase
    .from("sync_state")
    .select("id, cursor_data")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .single();

  const cursorData = (syncState?.cursor_data ?? {}) as Record<string, unknown>;
  const storedHistoryId = cursorData.history_id as string | undefined;

  let result: GmailSyncResult;

  if (storedHistoryId) {
    result = await incrementalSync(supabase, gmail, userId, storedHistoryId, filterRules);
  } else {
    result = await initialSync(supabase, gmail, userId, filterRules);
  }

  return result;
}

/**
 * Initial sync — fetch recent messages to bootstrap the system.
 * Gets the latest 50 messages and stores the current historyId for future incremental syncs.
 */
async function initialSync(
  supabase: SupabaseClient<Database>,
  gmail: gmail_v1.Gmail,
  userId: string,
  filterRules: FilterRule[],
): Promise<GmailSyncResult> {
  let newMessages = 0;
  let skippedByFilter = 0;
  let errors = 0;

  // Fetch recent messages (inbox only, skip sent/drafts, within lookback window)
  const afterDate = new Date(Date.now() - INITIAL_SYNC_LOOKBACK_DAYS * 86400 * 1000);
  const afterFormatted = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q: `in:inbox after:${afterFormatted}`,
  });

  const messageIds = listResponse.data.messages ?? [];

  // Process each message
  for (const msg of messageIds) {
    if (!msg.id) continue;

    try {
      const processed = await fetchAndStoreMessage(
        supabase,
        gmail,
        userId,
        msg.id,
        filterRules,
      );

      if (processed === "stored") newMessages++;
      else if (processed === "filtered") skippedByFilter++;
    } catch (err) {
      console.error(`Failed to process Gmail message ${msg.id}:`, err);
      errors++;
    }
  }

  // Get the current historyId for future incremental syncs
  const profile = await gmail.users.getProfile({ userId: "me" });
  const historyId = profile.data.historyId;

  if (historyId) {
    await updateSyncCursor(supabase, userId, historyId);
  }

  return { newMessages, skippedByFilter, errors };
}

/**
 * Incremental sync — use Gmail history API to get only new messages since last sync.
 */
async function incrementalSync(
  supabase: SupabaseClient<Database>,
  gmail: gmail_v1.Gmail,
  userId: string,
  startHistoryId: string,
  filterRules: FilterRule[],
): Promise<GmailSyncResult> {
  let newMessages = 0;
  let skippedByFilter = 0;
  let errors = 0;
  let latestHistoryId = startHistoryId;

  try {
    let pageToken: string | undefined;

    do {
      const historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        pageToken,
      });

      const histories = historyResponse.data.history ?? [];
      latestHistoryId = historyResponse.data.historyId ?? latestHistoryId;

      // Collect unique new message IDs
      const newMessageIds = new Set<string>();
      for (const history of histories) {
        for (const added of history.messagesAdded ?? []) {
          if (added.message?.id) {
            newMessageIds.add(added.message.id);
          }
        }
      }

      // Process each new message
      for (const messageId of newMessageIds) {
        try {
          const processed = await fetchAndStoreMessage(
            supabase,
            gmail,
            userId,
            messageId,
            filterRules,
          );

          if (processed === "stored") newMessages++;
          else if (processed === "filtered") skippedByFilter++;
        } catch (err) {
          console.error(`Failed to process Gmail message ${messageId}:`, err);
          errors++;
        }
      }

      pageToken = historyResponse.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err: unknown) {
    // historyId too old — Google returns 404
    if (isGmailNotFoundError(err)) {
      console.warn("Gmail historyId expired, performing full re-sync");
      return initialSync(supabase, gmail, userId, filterRules);
    }
    throw err;
  }

  // Update cursor with the latest historyId
  await updateSyncCursor(supabase, userId, latestHistoryId);

  return { newMessages, skippedByFilter, errors };
}

/**
 * Fetch a single Gmail message, parse it, check filters, and store it.
 * Returns "stored", "filtered", or "duplicate".
 */
async function fetchAndStoreMessage(
  supabase: SupabaseClient<Database>,
  gmail: gmail_v1.Gmail,
  userId: string,
  messageId: string,
  filterRules: FilterRule[],
): Promise<"stored" | "filtered" | "duplicate"> {
  // Fetch full message
  const messageResponse = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const parsed = parseGmailMessage(messageResponse.data);

  // Check filters
  const filterResult = checkEmailFilter(parsed.senderAddress, filterRules);

  // Build the row to insert
  const row = {
    user_id: userId,
    source: "email" as const,
    external_id: parsed.messageId,
    thread_id: parsed.threadId,
    sender_address: parsed.senderAddress,
    sender_name: parsed.senderName,
    recipients: parsed.recipients as Json,
    subject: parsed.subject,
    body_text: parsed.bodyText,
    body_html: parsed.bodyHtml,
    has_attachments: parsed.hasAttachments,
    message_timestamp: parsed.messageTimestamp.toISOString(),
    raw_metadata: {
      labels: parsed.labels,
      snippet: parsed.snippet,
    } as Json,
    processing_status: filterResult.shouldSkip
      ? ("skipped" as const)
      : ("pending" as const),
    filtered_by_rule_id: filterResult.matchedRuleId,
  };

  // Insert with dedup (unique constraint on user_id + source + external_id)
  const { error } = await supabase
    .from("source_messages")
    .insert(row);

  if (error) {
    // Duplicate — unique constraint violation
    if (error.code === "23505") {
      return "duplicate";
    }
    throw error;
  }

  return filterResult.shouldSkip ? "filtered" : "stored";
}

/**
 * Update the Gmail sync cursor in the database.
 */
async function updateSyncCursor(
  supabase: SupabaseClient<Database>,
  userId: string,
  historyId: string,
): Promise<void> {
  await supabase
    .from("sync_state")
    .update({
      cursor_data: { history_id: historyId } as Json,
      last_sync_completed_at: new Date().toISOString(),
      status: "idle" as const,
      consecutive_errors: 0,
    })
    .eq("user_id", userId)
    .eq("provider", "gmail");
}

/**
 * Check if a Gmail API error is a 404 (historyId not found).
 */
function isGmailNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: number }).code === 404;
  }
  return false;
}
