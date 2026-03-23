import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  SourceMessage,
  UserProfile,
  Contact,
  ProcessingRule,
} from "@/types/database";
import { getTriageModel, getAnalysisModel } from "./provider";
import { ActionItemExtractionSchema, type ExtractedActionItem } from "./schemas";
import { TriageClassificationSchema, type TriageMessageResult } from "./triage-schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { buildTriageSystemPrompt } from "./triage-prompts";
import {
  MAX_BATCH_SIZE_FOR_LLM,
  TRIAGE_MODEL_NAME,
  ANALYSIS_MODEL_NAME,
} from "@/lib/constants";

export interface PipelineResult {
  actionItemsCreated: number;
  messagesProcessed: number;
  messagesSkipped: number;
  messagesEscalated: number;
  errors: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

/**
 * Run the two-stage LLM processing pipeline for a user.
 *
 * Stage 1 (Triage): Cheap model classifies all messages
 *   - no_action → mark processed, skip
 *   - action_needed + high confidence → create action item directly
 *   - needs_deeper_analysis or low confidence → escalate to Stage 2
 *
 * Stage 2 (Analysis): Expensive model processes only escalated messages
 *   - Full action item extraction with delegation, reasoning, rules context
 */
export async function runPipeline(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PipelineResult> {
  let actionItemsCreated = 0;
  let messagesProcessed = 0;
  let messagesSkipped = 0;
  let messagesEscalated = 0;
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
      messagesEscalated: 0,
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
      messagesEscalated: 0,
      errors: 1,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
    };
  }

  // 3. Group messages into batches
  const batches = groupIntoBatches(pendingMessages);

  // Collect messages that need escalation to Stage 2
  const escalatedMessages: SourceMessage[] = [];

  // =========================================================================
  // STAGE 1: Triage (cheap model — DeepSeek V3.2)
  // =========================================================================
  for (const batch of batches) {
    await supabase
      .from("source_messages")
      .update({ processing_status: "processing" as const })
      .in(
        "id",
        batch.map((m) => m.id),
      );

    try {
      const triagePrompt = buildTriageSystemPrompt(profile);
      const userPrompt = buildUserPrompt(batch);

      const { object: triage, usage } = await generateObject({
        model: getTriageModel(),
        schema: TriageClassificationSchema,
        system: triagePrompt,
        prompt: userPrompt,
      });

      totalPromptTokens += usage.inputTokens ?? 0;
      totalCompletionTokens += usage.outputTokens ?? 0;

      for (const result of triage.messages) {
        const sourceMessage = batch[result.sourceMessageIndex];
        if (!sourceMessage) continue;

        if (result.classification === "no_action") {
          // Skip — no action needed
          messagesSkipped++;
          continue;
        }

        if (result.classification === "needs_deeper_analysis") {
          // Escalate to Stage 2
          escalatedMessages.push(sourceMessage);
          messagesEscalated++;
          continue;
        }

        // action_needed — check confidence
        if (result.confidence !== "high") {
          // Medium/low confidence → escalate to be safe
          escalatedMessages.push(sourceMessage);
          messagesEscalated++;
          continue;
        }

        // High-confidence action_needed → create action item directly from triage
        const created = await createActionItem(
          supabase,
          userId,
          sourceMessage,
          {
            title: result.preliminaryTitle,
            summary: result.preliminarySummary,
            actionType: result.preliminaryActionType,
            priority: result.preliminaryPriority,
            reasoning: result.escalationReason ?? "Identified by triage model",
            suggestedDelegateTo: null,
            delegateReason: null,
            sourceMessageIndex: result.sourceMessageIndex,
          },
          contacts,
          rules,
          TRIAGE_MODEL_NAME,
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
        );

        if (created) {
          actionItemsCreated++;
        } else {
          errors++;
        }
      }

      // Mark non-escalated messages as processed
      const escalatedIds = new Set(escalatedMessages.map((m) => m.id));
      const processedIds = batch
        .filter((m) => !escalatedIds.has(m.id))
        .map((m) => m.id);

      if (processedIds.length > 0) {
        await supabase
          .from("source_messages")
          .update({
            processing_status: "processed" as const,
            processed_at: new Date().toISOString(),
          })
          .in("id", processedIds);
      }

      messagesProcessed += processedIds.length;
    } catch (err) {
      console.error("Triage stage error:", err);

      // On triage failure, escalate entire batch to Stage 2 as fallback
      escalatedMessages.push(...batch);
      messagesEscalated += batch.length;
    }
  }

  // =========================================================================
  // STAGE 2: Deep Analysis (expensive model — Claude Sonnet 4)
  // Only processes escalated messages
  // =========================================================================
  if (escalatedMessages.length > 0) {
    const escalatedBatches = groupIntoBatches(escalatedMessages);

    for (const batch of escalatedBatches) {
      try {
        const applicableRules = findApplicableRules(batch, rules);

        const systemPrompt =
          profile.system_prompt_override ??
          buildSystemPrompt(profile, contacts, applicableRules);
        const userPrompt = buildUserPrompt(batch);

        const { object: extraction, usage } = await generateObject({
          model: getAnalysisModel(),
          schema: ActionItemExtractionSchema,
          system: systemPrompt,
          prompt: userPrompt,
        });

        const promptTokens = usage.inputTokens ?? 0;
        const completionTokens = usage.outputTokens ?? 0;
        totalPromptTokens += promptTokens;
        totalCompletionTokens += completionTokens;

        for (const item of extraction.items) {
          const sourceMessage = batch[item.sourceMessageIndex];
          if (!sourceMessage) continue;

          const created = await createActionItem(
            supabase,
            userId,
            sourceMessage,
            item,
            contacts,
            rules,
            ANALYSIS_MODEL_NAME,
            promptTokens,
            completionTokens,
          );

          if (created) {
            actionItemsCreated++;
          } else {
            errors++;
          }
        }

        // Mark escalated messages as processed
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
        console.error("Analysis stage error:", err);

        await supabase
          .from("source_messages")
          .update({
            processing_status: "error" as const,
            processing_error:
              err instanceof Error ? err.message : "Unknown LLM error",
          })
          .in(
            "id",
            batch.map((m) => m.id),
          );

        errors += batch.length;
      }
    }
  }

  return {
    actionItemsCreated,
    messagesProcessed,
    messagesSkipped,
    messagesEscalated,
    errors,
    totalPromptTokens,
    totalCompletionTokens,
  };
}

// =============================================================================
// Action Item Creation (shared by both stages)
// =============================================================================

/**
 * Create an action item with thread-level dedup.
 * Returns true if created, false if skipped or errored.
 */
async function createActionItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceMessage: SourceMessage,
  item: ExtractedActionItem,
  contacts: Contact[],
  rules: ProcessingRule[],
  modelName: string,
  promptTokens: number,
  completionTokens: number,
): Promise<boolean> {
  // Thread-level dedup
  if (sourceMessage.thread_id) {
    const { data: threadMsgs } = await supabase
      .from("source_messages")
      .select("id")
      .eq("user_id", userId)
      .eq("thread_id", sourceMessage.thread_id);

    if (threadMsgs && threadMsgs.length > 0) {
      const threadMsgIds = threadMsgs.map((m) => m.id);
      const { data: existingLinks } = await supabase
        .from("action_item_sources")
        .select("action_item_id")
        .in("source_message_id", threadMsgIds)
        .limit(5);

      if (existingLinks && existingLinks.length > 0) {
        const linkedIds = [
          ...new Set(existingLinks.map((l) => l.action_item_id)),
        ];
        const { data: activeItems } = await supabase
          .from("action_items")
          .select("id")
          .in("id", linkedIds)
          .eq("user_id", userId)
          .not("status", "in", '("done","dismissed")')
          .limit(1);

        if (activeItems && activeItems.length > 0) {
          await supabase.from("action_item_sources").insert({
            action_item_id: activeItems[0]!.id,
            source_message_id: sourceMessage.id,
            is_primary: false,
          });
          return true; // Linked to existing — counts as success, not a new item
        }
      }
    }
  }

  const delegateContact = item.suggestedDelegateTo
    ? findContactByName(contacts, item.suggestedDelegateTo)
    : null;

  const priorityOverride = findPriorityOverride(sourceMessage, rules);
  const finalPriority = priorityOverride ?? item.priority;

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
      llm_model: modelName,
      llm_prompt_tokens: promptTokens,
      llm_completion_tokens: completionTokens,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Failed to insert action item:", insertError);
    return false;
  }

  if (actionItem) {
    await supabase.from("action_item_sources").insert({
      action_item_id: actionItem.id,
      source_message_id: sourceMessage.id,
      is_primary: true,
    });
  }

  return true;
}

// =============================================================================
// Helper Functions
// =============================================================================

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

  for (const threadMessages of threadGroups.values()) {
    batches.push(threadMessages);
  }

  for (let i = 0; i < standalone.length; i += MAX_BATCH_SIZE_FOR_LLM) {
    batches.push(standalone.slice(i, i + MAX_BATCH_SIZE_FOR_LLM));
  }

  return batches;
}

function findApplicableRules(
  messages: SourceMessage[],
  allRules: ProcessingRule[],
): ProcessingRule[] {
  const applicable = new Set<string>();
  const result: ProcessingRule[] = [];

  for (const msg of messages) {
    for (const rule of allRules) {
      if (applicable.has(rule.id)) continue;
      if (doesRuleMatchMessage(rule, msg)) {
        applicable.add(rule.id);
        result.push(rule);
      }
    }
  }

  return result;
}

function doesRuleMatchMessage(
  rule: ProcessingRule,
  msg: SourceMessage,
): boolean {
  const senderAddress = (msg.sender_address ?? "").toLowerCase();
  const senderDomain = senderAddress.split("@")[1] ?? "";

  switch (rule.match_type) {
    case "email_address":
      return senderAddress === rule.match_value.toLowerCase();
    case "email_domain":
      return senderDomain === rule.match_value.toLowerCase();
    case "slack_user_id":
      return msg.sender_address === rule.match_value;
    case "slack_channel":
      return msg.channel_id === rule.match_value;
    default:
      return false;
  }
}

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

function findContactByName(
  contacts: Contact[],
  name: string,
): Contact | null {
  const normalized = name.toLowerCase().trim();

  const exact = contacts.find(
    (c) => c.full_name.toLowerCase() === normalized,
  );
  if (exact) return exact;

  const partial = contacts.find((c) => {
    const parts = c.full_name.toLowerCase().split(/\s+/);
    return parts.some((p) => p === normalized);
  });
  if (partial) return partial;

  const contains = contacts.find((c) =>
    c.full_name.toLowerCase().includes(normalized),
  );
  return contains ?? null;
}
