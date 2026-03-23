import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, NotFoundError, ValidationError } from "@/lib/errors";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z
    .enum(["new", "read", "acknowledged", "in_progress", "done", "dismissed"])
    .optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
});

/**
 * GET /api/action-items/[id]
 * Get action item detail with source message(s).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const { id } = await params;

    // Fetch the action item
    const { data: item, error } = await supabase
      .from("action_items")
      .select(
        "id, title, summary, action_type, priority, status, delegate_reason, ai_reasoning, due_date, snoozed_until, llm_model, created_at, updated_at, suggested_delegate, metadata",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !item) {
      throw new NotFoundError("Action item");
    }

    // Fetch linked source messages
    const { data: sources } = await supabase
      .from("action_item_sources")
      .select("source_message_id, is_primary")
      .eq("action_item_id", id);

    let sourceMessages: Array<Record<string, unknown>> = [];
    if (sources && sources.length > 0) {
      const messageIds = sources.map((s) => s.source_message_id);
      const { data: messages } = await supabase
        .from("source_messages")
        .select(
          "id, source, sender_address, sender_name, channel_name, subject, body_text, message_timestamp",
        )
        .in("id", messageIds);

      sourceMessages = (messages ?? []).map((msg) => ({
        ...msg,
        is_primary: sources.find((s) => s.source_message_id === msg.id)?.is_primary ?? false,
      }));
    }

    // Fetch delegate contact name if present
    let delegateName: string | null = null;
    if (item.suggested_delegate) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("full_name")
        .eq("id", item.suggested_delegate)
        .single();
      delegateName = contact?.full_name ?? null;
    }

    // Fetch history
    const { data: history } = await supabase
      .from("action_item_history")
      .select("previous_status, new_status, note, created_at")
      .eq("action_item_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch feedback
    const { data: feedback } = await supabase
      .from("action_item_feedback")
      .select("id, category, comment, resolved, created_at")
      .eq("action_item_id", id)
      .order("created_at", { ascending: false });

    return Response.json({
      data: {
        ...item,
        suggested_delegate_name: delegateName,
        source_messages: sourceMessages,
        history: history ?? [],
        feedback: feedback ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/action-items/[id]
 * Update action item status, snooze, or priority.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const { id } = await params;
    const body = await request.json();

    // Validate input
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const updates = parsed.data;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError("No valid fields to update");
    }

    const { data: updated, error } = await supabase
      .from("action_items")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, title, status, priority, snoozed_until, updated_at")
      .single();

    if (error || !updated) {
      throw new NotFoundError("Action item");
    }

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
