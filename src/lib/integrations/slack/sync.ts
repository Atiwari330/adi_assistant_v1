import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FilterRule, Json } from "@/types/database";
import { getSlackClient } from "./client";
import { checkSlackFilter } from "@/lib/ingestion/filter";
import { MAX_BODY_LENGTH_FOR_LLM, INITIAL_SYNC_LOOKBACK_DAYS } from "@/lib/constants";

interface SlackSyncResult {
  newMessages: number;
  skippedByFilter: number;
  errors: number;
}

interface ChannelCursors {
  [channelId: string]: string; // channel ID -> latest message timestamp
}

// Cache user info to avoid repeated API calls within a sync
const userCache = new Map<string, { name: string; email: string | null }>();

/**
 * Perform a Slack sync for a user.
 *
 * Flow:
 * 1. Get stored per-channel cursors from sync_state
 * 2. List all channels the bot is in
 * 3. For each channel: fetch new messages since cursor, check filters, store
 * 4. Handle threads (fetch replies for threaded messages)
 * 5. Update sync_state cursors
 */
export async function syncSlack(
  supabase: SupabaseClient<Database>,
  userId: string,
  filterRules: FilterRule[],
): Promise<SlackSyncResult> {
  const slack = await getSlackClient(supabase, userId);

  // Get current sync cursors
  const { data: syncState } = await supabase
    .from("sync_state")
    .select("id, cursor_data")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .single();

  const cursorData = (syncState?.cursor_data ?? {}) as Record<string, unknown>;
  const channelCursors = (cursorData.channel_cursors ?? {}) as ChannelCursors;

  let totalNew = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Clear user cache for this sync run
  userCache.clear();

  // Get all channels the bot is in
  const channels = await listBotChannels(slack);

  // Process each channel
  for (const channel of channels) {
    const channelId = channel.id;
    const channelName = channel.name ?? channelId;

    if (!channelId) continue;

    // Check if this channel is filtered out
    const channelFilter = checkSlackFilter(channelId, null, filterRules);
    if (channelFilter.shouldSkip) {
      continue;
    }

    try {
      // On first sync (no cursor), only look back N days to avoid stale messages
      const effectiveCursor = channelCursors[channelId]
        ?? String(Math.floor((Date.now() - INITIAL_SYNC_LOOKBACK_DAYS * 86400 * 1000) / 1000));

      const result = await syncChannel(
        supabase,
        slack,
        userId,
        channelId,
        channelName,
        effectiveCursor,
        filterRules,
      );

      totalNew += result.newMessages;
      totalSkipped += result.skippedByFilter;
      totalErrors += result.errors;

      // Update cursor for this channel
      if (result.latestTimestamp) {
        channelCursors[channelId] = result.latestTimestamp;
      }
    } catch (err) {
      console.error(`Failed to sync Slack channel ${channelName}:`, err);
      totalErrors++;
    }
  }

  // Persist updated cursors
  await supabase
    .from("sync_state")
    .update({
      cursor_data: { channel_cursors: channelCursors } as Json,
      last_sync_completed_at: new Date().toISOString(),
      status: "idle" as const,
      consecutive_errors: 0,
    })
    .eq("user_id", userId)
    .eq("provider", "slack");

  return { newMessages: totalNew, skippedByFilter: totalSkipped, errors: totalErrors };
}

/**
 * List all channels the bot has been added to.
 */
async function listBotChannels(slack: WebClient) {
  const channels: Array<{ id: string; name: string }> = [];
  let cursor: string | undefined;

  do {
    const result = await slack.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });

    for (const channel of result.channels ?? []) {
      if (channel.is_member && channel.id && channel.name) {
        channels.push({ id: channel.id, name: channel.name });
      }
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels;
}

interface ChannelSyncResult {
  newMessages: number;
  skippedByFilter: number;
  errors: number;
  latestTimestamp: string | null;
}

/**
 * Sync a single Slack channel — fetch messages newer than the cursor.
 */
async function syncChannel(
  supabase: SupabaseClient<Database>,
  slack: WebClient,
  userId: string,
  channelId: string,
  channelName: string,
  oldestCursor: string | undefined,
  filterRules: FilterRule[],
): Promise<ChannelSyncResult> {
  let newMessages = 0;
  let skippedByFilter = 0;
  let errors = 0;
  let latestTimestamp: string | null = null;

  let cursor: string | undefined;

  do {
    const result = await slack.conversations.history({
      channel: channelId,
      oldest: oldestCursor,
      limit: 100,
      cursor,
    });

    const messages = result.messages ?? [];

    for (const message of messages) {
      // Skip subtypes that aren't real messages (channel_join, bot_message with no useful text, etc.)
      if (message.subtype && !["bot_message", "file_share"].includes(message.subtype)) {
        continue;
      }

      if (!message.ts || !message.text) continue;

      // Track latest timestamp
      if (!latestTimestamp || message.ts > latestTimestamp) {
        latestTimestamp = message.ts;
      }

      // Check filters
      const filterResult = checkSlackFilter(channelId, message.user ?? null, filterRules);

      try {
        // Resolve user info
        const userInfo = message.user
          ? await resolveSlackUser(slack, message.user)
          : { name: message.username ?? "Unknown", email: null };

        // Build the external ID: channelId:messageTs
        const externalId = `${channelId}:${message.ts}`;

        // If it's a thread parent with replies, fetch the thread
        let bodyText = message.text;
        let threadId: string | null = null;

        if (message.reply_count && message.reply_count > 0 && message.thread_ts) {
          threadId = `${channelId}:${message.thread_ts}`;
          const threadText = await fetchThreadContext(slack, channelId, message.thread_ts);
          if (threadText) {
            bodyText = threadText;
          }
        } else if (message.thread_ts && message.thread_ts !== message.ts) {
          // This is a reply in a thread — skip standalone processing,
          // it will be included when the parent thread is synced
          continue;
        }

        // Truncate body
        if (bodyText.length > MAX_BODY_LENGTH_FOR_LLM) {
          bodyText = bodyText.slice(0, MAX_BODY_LENGTH_FOR_LLM) + "\n\n[... truncated]";
        }

        const row = {
          user_id: userId,
          source: "slack" as const,
          external_id: externalId,
          thread_id: threadId,
          sender_address: message.user ?? null,
          sender_name: userInfo.name,
          channel_id: channelId,
          channel_name: channelName,
          subject: null, // Slack messages don't have subjects
          body_text: bodyText,
          body_html: null,
          has_attachments: (message.files?.length ?? 0) > 0,
          message_timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
          raw_metadata: {
            reactions: message.reactions as Json ?? [],
            reply_count: message.reply_count ?? 0,
          } as Json,
          processing_status: filterResult.shouldSkip
            ? ("skipped" as const)
            : ("pending" as const),
          filtered_by_rule_id: filterResult.matchedRuleId,
        };

        const { error } = await supabase.from("source_messages").insert(row);

        if (error) {
          if (error.code === "23505") {
            // Duplicate — already processed
            continue;
          }
          throw error;
        }

        if (filterResult.shouldSkip) {
          skippedByFilter++;
        } else {
          newMessages++;
        }
      } catch (err) {
        console.error(`Failed to process Slack message ${message.ts}:`, err);
        errors++;
      }
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return { newMessages, skippedByFilter, errors, latestTimestamp };
}

/**
 * Fetch thread replies and combine into a single context string.
 */
async function fetchThreadContext(
  slack: WebClient,
  channelId: string,
  threadTs: string,
): Promise<string | null> {
  try {
    const result = await slack.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 20,
    });

    const messages = result.messages ?? [];
    if (messages.length <= 1) return null;

    // Take the last N messages for context
    const recentMessages = messages.slice(-5);

    const parts: string[] = [];
    for (const msg of recentMessages) {
      const userInfo = msg.user
        ? await resolveSlackUser(slack, msg.user)
        : { name: "Unknown", email: null };

      parts.push(`[${userInfo.name}]: ${msg.text ?? ""}`);
    }

    if (messages.length > 5) {
      parts.unshift(`[... ${messages.length - 5} earlier messages in thread]`);
    }

    return parts.join("\n\n");
  } catch {
    return null;
  }
}

/**
 * Resolve a Slack user ID to their display name and email.
 * Results are cached for the duration of the sync run.
 */
async function resolveSlackUser(
  slack: WebClient,
  userId: string,
): Promise<{ name: string; email: string | null }> {
  const cached = userCache.get(userId);
  if (cached) return cached;

  try {
    const result = await slack.users.info({ user: userId });

    const user = result.user;
    const info = {
      name: user?.real_name ?? user?.name ?? userId,
      email: user?.profile?.email ?? null,
    };

    userCache.set(userId, info);
    return info;
  } catch {
    const fallback = { name: userId, email: null };
    userCache.set(userId, fallback);
    return fallback;
  }
}
