import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  SourceMessage,
  UserProfile,
  Contact,
  ProcessingRule,
  Json,
} from "@/types/database";
import { getModel } from "./provider";
import { ActionItemExtractionSchema, type ExtractedActionItem } from "./schemas";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { MAX_BATCH_SIZE_FOR_LLM } from "@/lib/constants";

export interface PipelineResult {
  actionItemsCreated: number;
  messagesProcessed: number;
  messagesSkipped: number;
  errors: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

/**
 * Run the LLM processing pipeline for a user.
 *
 * Flow:
 * 1. Query pending source_messages
 * 2. Load user profile, contacts, processing rules
 * 3. Group messages by thread (or batch standalone messages)
 * 4. For each batch: build prompt → generateObject → store action items
 * 5. Update source_messages to 'processed'
 */
export async function runPipeline(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PipelineResult> {
  let actionItemsCreated = 0;
  let messagesProcessed = 0;
  let messagesSkipped = 0;
  let errors = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // 1. Get pending messages
  const { data: pendingMessages } = await supabase
    .from("source_messages")
    .select(
      "id, user_id, source, external_id, thread_id, sender_address, sender_name, recipients, channel_id, channel_name, subject, body_text, body_html, has_attachments, message_timestamp, raw_metadata, processing_status, filtered_by_rule_id, processing_error, processed_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("processing_status", "pending")
    .order("message_timestamp", { ascending: true })
    .limit(100);

  if (!pendingMessages || pendingMessages.length === 0) {
    return {
      actionItemsCreated: 0,
      messagesProcessed: 0,
      messagesSkipped: 0,
      errors: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
    };
  }

  // 2. Load user context
  const [profileResult, contactsResult, rulesResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "id, user_id, display_name, job_title, role_description, company_name, company_description, team_structure, work_preferences, system_prompt_override, created_at, updated_at",
      )
      .eq("user_id", userId)
      .single(),
    supabase
      .from("contacts")
      .select(
        "id, user_id, full_name, email, slack_user_id, job_title, organization, relationship, is_delegate, notes, metadata, created_at, updated_at",
      )
      .eq("user_id", userId),
    supabase
      .from("processing_rules")
      .select(
        "id, user_id, match_type, match_value, priority_override, delegate_to, instruction_text, is_active, created_at, updated_at",
      )
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);

  const profile = profileResult.data;
  const contacts = contactsResult.data ?? [];
  const rules = rulesResult.data ?? [];

  if (!profile) {
    console.error(`No user profile found for user ${userId}`);
    return {
      actionItemsCreated: 0,
      messagesProcessed: 0,
      messagesSkipped: 0,
      errors: 1,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
    };
  }

  // 3. Group messages into batches
  const batches = groupIntoBatches(pendingMessages);

  // 4. Process each batch
  for (const batch of batches) {
    // Mark messages as processing
    await supabase
      .from("source_messages")
      .update({ processing_status: "processing" as const })
      .in(
        "id",
        batch.map((m) => m.id),
      );

    try {
      // Find applicable per-sender rules for this batch
      const applicableRules = findApplicableRules(batch, rules);

      // Build prompts
      const systemPrompt =
        profile.system_prompt_override ??
        buildSystemPrompt(profile, contacts, applicableRules);
      const userPrompt = buildUserPrompt(batch);

      // Call LLM
      const { object: extraction, usage } = await generateObject({
        model: getModel(),
        schema: ActionItemExtractionSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      const promptTokens = usage.inputTokens ?? 0;
      const completionTokens = usage.outputTokens ?? 0;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;

      // Store action items
      for (const item of extraction.items) {
        const sourceMessage = batch[item.sourceMessageIndex];
        if (!sourceMessage) continue;

        // Find suggested delegate contact
        const delegateContact = item.suggestedDelegateTo
          ? findContactByName(contacts, item.suggestedDelegateTo)
          : null;

        // Check if a rule overrides the priority
        const priorityOverride = findPriorityOverride(sourceMessage, rules);
        const finalPriority = priorityOverride ?? item.priority;

        // Insert action item
        const { data: actionItem, error: insertError } = await supabase
          .from("action_items")
          .insert({
            user_id: userId,
            title: item.title.slice(0, 200),
            summary: item.summary,
            action_type: item.actionType,
            priority: finalPriority,
            status: "new" as const,
            suggested_delegate: delegateContact?.id ?? null,
            delegate_reason: item.delegateReason,
            ai_reasoning: item.reasoning,
            llm_model: "claude-sonnet-4-20250514",
            llm_prompt_tokens: promptTokens,
            llm_completion_tokens: completionTokens,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Failed to insert action item:", insertError);
          errors++;
          continue;
        }

        // Link action item to source message
        if (actionItem) {
          await supabase.from("action_item_sources").insert({
            action_item_id: actionItem.id,
            source_message_id: sourceMessage.id,
            is_primary: true,
          });
        }

        actionItemsCreated++;
      }

      // Mark all messages in batch as processed
      await supabase
        .from("source_messages")
        .update({
          processing_status: "processed" as const,
          processed_at: new Date().toISOString(),
        })
        .in(
          "id",
          batch.map((m) => m.id),
        );

      messagesProcessed += batch.length;
      messagesSkipped += extraction.noActionNeeded.length;
    } catch (err) {
      console.error("LLM pipeline batch error:", err);

      // Mark messages as error so they can be retried next cycle
      await supabase
        .from("source_messages")
        .update({
          processing_status: "error" as const,
          processing_error: err instanceof Error ? err.message : "Unknown LLM error",
        })
        .in(
          "id",
          batch.map((m) => m.id),
        );

      errors += batch.length;
    }
  }

  return {
    actionItemsCreated,
    messagesProcessed,
    messagesSkipped,
    errors,
    totalPromptTokens,
    totalCompletionTokens,
  };
}

/**
 * Group messages into processing batches.
 * - Messages in the same thread go together
 * - Standalone messages are batched up to MAX_BATCH_SIZE_FOR_LLM
 */
function groupIntoBatches(messages: SourceMessage[]): SourceMessage[][] {
  const batches: SourceMessage[][] = [];
  const threadGroups = new Map<string, SourceMessage[]>();
  const standalone: SourceMessage[] = [];

  for (const msg of messages) {
    if (msg.thread_id) {
      const existing = threadGroups.get(msg.thread_id) ?? [];
      existing.push(msg);
      threadGroups.set(msg.thread_id, existing);
    } else {
      standalone.push(msg);
    }
  }

  // Each thread group is its own batch
  for (const threadMessages of threadGroups.values()) {
    batches.push(threadMessages);
  }

  // Batch standalone messages
  for (let i = 0; i < standalone.length; i += MAX_BATCH_SIZE_FOR_LLM) {
    batches.push(standalone.slice(i, i + MAX_BATCH_SIZE_FOR_LLM));
  }

  return batches;
}

/**
 * Find processing rules that apply to any sender in the batch.
 */
function findApplicableRules(
  messages: SourceMessage[],
  allRules: ProcessingRule[],
): ProcessingRule[] {
  const applicable = new Set<string>();
  const result: ProcessingRule[] = [];

  for (const msg of messages) {
    for (const rule of allRules) {
      if (applicable.has(rule.id)) continue;

      const matches = doesRuleMatchMessage(rule, msg);
      if (matches) {
        applicable.add(rule.id);
        result.push(rule);
      }
    }
  }

  return result;
}

/**
 * Check if a processing rule matches a specific message.
 */
function doesRuleMatchMessage(rule: ProcessingRule, msg: SourceMessage): boolean {
  const senderAddress = (msg.sender_address ?? "").toLowerCase();
  const senderDomain = senderAddress.split("@")[1] ?? "";

  switch (rule.match_type) {
    case "email_address":
      return senderAddress === rule.match_value.toLowerCase();
    case "email_domain":
      return senderDomain === rule.match_value.toLowerCase();
    case "slack_user_id":
      return msg.sender_address === rule.match_value; // For Slack, sender_address is user ID
    case "slack_channel":
      return msg.channel_id === rule.match_value;
    default:
      return false;
  }
}

/**
 * Find a priority override from rules for a specific message.
 */
function findPriorityOverride(
  msg: SourceMessage,
  rules: ProcessingRule[],
): ExtractedActionItem["priority"] | null {
  for (const rule of rules) {
    if (rule.priority_override && doesRuleMatchMessage(rule, msg)) {
      return rule.priority_override;
    }
  }
  return null;
}

/**
 * Find a contact by name (fuzzy match for delegation suggestions).
 */
function findContactByName(contacts: Contact[], name: string): Contact | null {
  const normalized = name.toLowerCase().trim();

  // Exact match
  const exact = contacts.find(
    (c) => c.full_name.toLowerCase() === normalized,
  );
  if (exact) return exact;

  // Partial match (first name or last name)
  const partial = contacts.find((c) => {
    const parts = c.full_name.toLowerCase().split(/\s+/);
    return parts.some((p) => p === normalized);
  });
  if (partial) return partial;

  // Contains match
  const contains = contacts.find((c) =>
    c.full_name.toLowerCase().includes(normalized),
  );
  return contains ?? null;
}
