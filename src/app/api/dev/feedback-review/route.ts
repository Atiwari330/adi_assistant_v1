import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { NextRequest } from "next/server";
import type { FeedbackCategory, UserProfile, Contact, ProcessingRule } from "@/types/database";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/dev/feedback-review
 * Developer review endpoint — returns recent feedback with full context.
 *
 * Query params:
 *   limit    — max entries (default 20, max 50)
 *   resolved — "true" or "false" (default "false")
 *   category — optional feedback_category filter
 *
 * Auth: Authorization: Bearer <FEEDBACK_REVIEW_SECRET>
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const secret = process.env.FEEDBACK_REVIEW_SECRET;
    if (!secret) {
      return Response.json(
        { error: "FEEDBACK_REVIEW_SECRET not configured" },
        { status: 500 },
      );
    }

    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT),
      MAX_LIMIT,
    );
    const resolved = url.searchParams.get("resolved") === "true";
    const categoryFilter = url.searchParams.get("category") as FeedbackCategory | null;

    const supabase = createAdminClient();

    // Fetch feedback
    let feedbackQuery = supabase
      .from("action_item_feedback")
      .select("id, user_id, action_item_id, category, comment, resolved, created_at")
      .eq("resolved", resolved)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (categoryFilter) {
      feedbackQuery = feedbackQuery.eq("category", categoryFilter);
    }

    const { data: feedbackRows, error: fbError } = await feedbackQuery;
    if (fbError) {
      return Response.json({ error: fbError.message }, { status: 500 });
    }

    const feedback = feedbackRows ?? [];

    // Build enriched feedback with context
    const enrichedFeedback = await Promise.all(
      feedback.map(async (fb) => {
        // Fetch the action item
        const { data: item } = await supabase
          .from("action_items")
          .select(
            "id, title, summary, action_type, priority, status, ai_reasoning, delegate_reason, suggested_delegate, created_at",
          )
          .eq("id", fb.action_item_id)
          .single();

        // Fetch delegate name if present
        let suggestedDelegateName: string | null = null;
        if (item?.suggested_delegate) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("full_name")
            .eq("id", item.suggested_delegate)
            .single();
          suggestedDelegateName = contact?.full_name ?? null;
        }

        // Fetch source messages linked to this action item
        const { data: sources } = await supabase
          .from("action_item_sources")
          .select("source_message_id")
          .eq("action_item_id", fb.action_item_id);

        let sourceMessages: Array<Record<string, unknown>> = [];
        if (sources && sources.length > 0) {
          const messageIds = sources.map((s) => s.source_message_id);
          const { data: messages } = await supabase
            .from("source_messages")
            .select(
              "source, sender_name, sender_address, channel_name, subject, body_text, message_timestamp",
            )
            .in("id", messageIds);
          sourceMessages = messages ?? [];
        }

        return {
          id: fb.id,
          category: fb.category,
          comment: fb.comment,
          resolved: fb.resolved,
          created_at: fb.created_at,
          action_item: item
            ? {
                id: item.id,
                title: item.title,
                summary: item.summary,
                action_type: item.action_type,
                priority: item.priority,
                status: item.status,
                ai_reasoning: item.ai_reasoning,
                delegate_reason: item.delegate_reason,
                suggested_delegate_name: suggestedDelegateName,
                created_at: item.created_at,
              }
            : null,
          source_messages: sourceMessages,
        };
      }),
    );

    // Compute category counts across all unresolved feedback
    const { data: allUnresolved } = await supabase
      .from("action_item_feedback")
      .select("category")
      .eq("resolved", false);

    const categoryCounts: Record<string, number> = {};
    for (const row of allUnresolved ?? []) {
      categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
    }

    // Build system prompt for context (use first user's profile)
    let currentSystemPrompt: string | null = null;
    if (feedback.length > 0) {
      const userId = feedback[0]!.user_id;

      const [{ data: profile }, { data: contacts }, { data: rules }] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", userId).single(),
        supabase.from("contacts").select("*").eq("user_id", userId),
        supabase
          .from("processing_rules")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true),
      ]);

      if (profile) {
        currentSystemPrompt = buildSystemPrompt(
          profile as UserProfile,
          (contacts ?? []) as Contact[],
          (rules ?? []) as ProcessingRule[],
        );
      }
    }

    return Response.json({
      generated_at: new Date().toISOString(),
      feedback_count: enrichedFeedback.length,
      current_system_prompt: currentSystemPrompt,
      feedback: enrichedFeedback,
      category_counts: categoryCounts,
    });
  } catch (error) {
    console.error("Feedback review error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/dev/feedback-review
 * Mark feedback entries as resolved.
 *
 * Body: { ids: string[] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const secret = process.env.FEEDBACK_REVIEW_SECRET;
    if (!secret) {
      return Response.json(
        { error: "FEEDBACK_REVIEW_SECRET not configured" },
        { status: 500 },
      );
    }

    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json(
        { error: "ids must be a non-empty array of feedback IDs" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("action_item_feedback")
      .update({ resolved: true })
      .in("id", ids)
      .select("id, resolved");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ data, resolved_count: data?.length ?? 0 });
  } catch (error) {
    console.error("Feedback resolve error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
